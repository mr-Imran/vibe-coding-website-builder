// Tests for the core, named by requirement id (see tools/rubric.js).
// They cover what the core gives every app. M01, M04 and M08 are about your
// own modules and deployment, so their tests live in your module test files.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import { loadConfig } from '../config.js';
import { hashPassword, verifyPassword } from '../core/auth.js';
import { migrate, openDb, tx } from '../core/db.js';
import { localParts, zonedToUtc } from '../core/time.js';
import { check } from '../core/validate.js';
import { CORE, setupFixture } from './fixture.js';
import { removeFolder, startApp } from './helpers.js';
import { giveBack, takeOne, updateVersioned } from '../core/records.js';

describe('core', () => {
  let t;
  let admin;
  let ann;
  let ben;

  before(async () => {
    t = await startApp({ setup: setupFixture, config: CORE });
    admin = await t.user('admin@test.local', 'admin');
    ann = await t.user('ann@test.local');
    ben = await t.user('ben@test.local');
  });
  after(async () => { await t.stop(); });

  // ---------------------------------------------------------------- M02 database

  test('core M02 migrations run once, in order, and are remembered', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mig-'));
    const db = openDb(path.join(dir, 'x.db'));
    const migrations = path.resolve(import.meta.dirname, '../migrations');
    const applied = migrate(db, migrations);
    assert.equal(applied[0], '001_core.sql');
    assert.deepEqual(applied, [...applied].sort(), 'in name order');
    assert.deepEqual(migrate(db, migrations), [], 'nothing runs a second time');
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('core M02 create, read, update and delete a record through the routes', async () => {
    const made = await ann.post('/api/_t/things', { title: 'Paint the fence', price: 12.5 });
    assert.equal(made.status, 201);
    const id = made.body.id;
    const read = await ann.get(`/api/_t/things/${id}`);
    assert.equal(read.body.thing.title, 'Paint the fence');
    const changed = await ann.patch(`/api/_t/things/${id}`, { title: 'Paint the gate', version: 1 });
    assert.equal(changed.body.thing.title, 'Paint the gate');
    assert.equal(changed.body.thing.version, 2);
    assert.equal((await ann.delete(`/api/_t/things/${id}`)).status, 204);
    assert.equal((await ann.get(`/api/_t/things/${id}`)).status, 404);
  });

  test('core M02 data is still there after the app stops and starts again', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'persist-'));
    const first = await startApp({ setup: setupFixture, dir, config: CORE });
    const user = await first.user('keeper@test.local');
    const made = await user.post('/api/_t/things', { title: 'Remember me' });
    await first.stop();

    const second = await startApp({ dir, config: CORE });      // same folder, tables already exist
    const row = second.db.prepare('SELECT title FROM t_things WHERE id = ?').get(made.body.id);
    assert.equal(row.title, 'Remember me');
    await second.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('core M02 relationships are enforced: no record for a user who does not exist, and a deleted user takes their sessions along', () => {
    assert.throws(() => t.db.prepare("INSERT INTO t_things (owner_id, title, created_at) VALUES (99999, 'orphan', 'now')").run(), /FOREIGN KEY/);
    const id = Number(t.db.prepare("INSERT INTO users (email, name, password_hash, role, created_at) VALUES ('gone@test.local', 'Gone', 'x', 'member', 'now')").run().lastInsertRowid);
    t.db.prepare("INSERT INTO sessions (token_hash, user_id, csrf, created_at, last_seen_at, expires_at) VALUES ('h', ?, 'c', 'now', 'now', 'later')").run(id);
    t.db.prepare('DELETE FROM users WHERE id = ?').run(id);
    assert.equal(t.db.prepare('SELECT COUNT(*) AS n FROM sessions WHERE user_id = ?').get(id).n, 0);
  });

  // ---------------------------------------------------------------- M03 sign-in, roles, sessions

  test('core M03 passwords are stored as salted hashes, never as text', async () => {
    const hash = await hashPassword('correct horse battery');
    assert.match(hash, /^scrypt\$/);
    assert.ok(!hash.includes('correct horse'));
    assert.notEqual(hash, await hashPassword('correct horse battery'));
    assert.equal(await verifyPassword('correct horse battery', hash), true);
    assert.equal(await verifyPassword('wrong', hash), false);
    const stored = t.db.prepare("SELECT password_hash FROM users WHERE email = 'ann@test.local'").get().password_hash;
    assert.match(stored, /^scrypt\$/);
  });

  test('core M03 signing in sets a cookie that scripts cannot read, and wrong details get one vague answer', async () => {
    const c = t.client();
    const ok = await c.post('/api/auth/login', { email: 'ann@test.local', password: 'correct horse battery' });
    assert.equal(ok.status, 200);
    const setCookie = ok.headers.getSetCookie()[0];
    assert.match(setCookie, /HttpOnly/);
    assert.match(setCookie, /SameSite=Lax/);
    assert.equal(ok.body.user.email, 'ann@test.local');
    assert.equal(ok.body.user.password_hash, undefined);

    const wrong = await t.client().post('/api/auth/login', { email: 'ann@test.local', password: 'not it at all' });
    const unknown = await t.client().post('/api/auth/login', { email: 'nobody@test.local', password: 'not it at all' });
    assert.equal(wrong.status, 401);
    assert.equal(unknown.status, 401);
    assert.equal(wrong.body.error.message, unknown.body.error.message);
  });

  test('core M03 nothing behind sign-in answers without a session', async () => {
    const anon = t.client();
    assert.equal((await anon.get('/api/_t/things')).status, 401);
    assert.equal((await anon.get('/api/auth/me')).status, 401);
    assert.equal((await anon.post('/api/_t/things', { title: 'x' })).status, 401);
  });

  test('core M03 a change without the session token is refused, and so is one sent from another website', async () => {
    const noToken = await ann.post('/api/_t/things', { title: 'forged' }, { 'X-CSRF-Token': '' });
    assert.equal(noToken.status, 403);
    const wrongToken = await ann.post('/api/_t/things', { title: 'forged' }, { 'X-CSRF-Token': 'guess' });
    assert.equal(wrongToken.status, 403);
    const elsewhere = await ann.post('/api/_t/things', { title: 'forged' }, { Origin: 'https://evil.example' });
    assert.equal(elsewhere.status, 403);
    assert.equal(t.db.prepare("SELECT COUNT(*) AS n FROM t_things WHERE title = 'forged'").get().n, 0);
  });

  test('core M03 roles are enforced on the server, and a refusal is logged', async () => {
    assert.equal((await ann.get('/api/_t/admin-only')).status, 403);
    assert.equal((await admin.get('/api/_t/admin-only')).status, 200);
    assert.equal((await ann.get('/api/users')).status, 403);
    assert.equal((await admin.get('/api/users')).status, 200);
    assert.ok(t.db.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'auth.denied'").get().n >= 1);
  });

  test('core M03 a new account cannot give itself a role', async () => {
    const c = t.client();
    const sneaky = await c.post('/api/auth/signup', { email: 'sneak@test.local', name: 'Sneak', password: 'long enough pw', role: 'admin' });
    assert.equal(sneaky.status, 422);
    const plain = await c.post('/api/auth/signup', { email: 'sneak@test.local', name: 'Sneak', password: 'long enough pw' });
    assert.equal(plain.status, 201);
    assert.equal(plain.body.user.role, 'member');
    const dup = await t.client().post('/api/auth/signup', { email: 'sneak@test.local', name: 'Again', password: 'long enough pw' });
    assert.equal(dup.status, 422);
    const short = await t.client().post('/api/auth/signup', { email: 'short@test.local', name: 'Short', password: 'short' });
    assert.equal(short.status, 422);
    assert.ok(short.body.error.fields.password);
  });

  test('core M03 signing out ends the session for good', async () => {
    const c = await t.user('leaver@test.local');
    const oldCookie = c.cookie;
    assert.equal((await c.get('/api/auth/me')).status, 200);
    assert.equal((await c.post('/api/auth/logout')).status, 204);
    const replay = await t.client().get('/api/auth/me', { Cookie: oldCookie });
    assert.equal(replay.status, 401);
  });

  test('core M03 an expired or idle session stops working', async () => {
    const c = await t.user('sleepy@test.local');
    t.db.prepare('UPDATE sessions SET expires_at = ? WHERE user_id = ?').run(new Date(Date.now() - 1000).toISOString(), c.id);
    assert.equal((await c.get('/api/auth/me')).status, 401);

    const d = await t.user('idle@test.local');
    t.db.prepare('UPDATE sessions SET last_seen_at = ? WHERE user_id = ?').run(new Date(Date.now() - 25 * 3600_000).toISOString(), d.id);
    assert.equal((await d.get('/api/auth/me')).status, 401);
  });

  test('core M03 repeated wrong passwords are slowed down', async () => {
    await t.auth.createUser({ email: 'target@test.local', name: 'Target', password: 'the real password' });
    const statuses = [];
    for (let i = 0; i < 7; i++) {
      statuses.push((await t.client().post('/api/auth/login', { email: 'target@test.local', password: `guess number ${i}` })).status);
    }
    assert.deepEqual(statuses.slice(0, 5), [401, 401, 401, 401, 401]);
    assert.equal(statuses[5], 429);
    // Even the right password waits while the lock is on.
    assert.equal((await t.client().post('/api/auth/login', { email: 'target@test.local', password: 'the real password' })).status, 429);
    t.db.prepare('DELETE FROM login_attempts').run();
  });

  test('core M03 changing a password needs the current one and signs out other devices', async () => {
    const phone = await t.user('two@test.local');
    const laptop = t.client();
    await laptop.post('/api/auth/login', { email: 'two@test.local', password: 'correct horse battery' });
    const bad = await laptop.post('/api/auth/password', { current: 'nope nope nope', next: 'a brand new password' });
    assert.equal(bad.status, 422);
    assert.equal((await laptop.post('/api/auth/password', { current: 'correct horse battery', next: 'a brand new password' })).status, 204);
    assert.equal((await laptop.get('/api/auth/me')).status, 200);
    assert.equal((await phone.get('/api/auth/me')).status, 401);
  });

  test('core M03 the only administrator cannot be removed or switched off', async () => {
    const res = await admin.patch(`/api/users/${admin.id}`, { role: 'member' });
    assert.equal(res.status, 409);
    const off = await admin.patch(`/api/users/${admin.id}`, { active: false });
    assert.equal(off.status, 409);
    // Switching someone off ends their sessions at once.
    const temp = await t.user('temp@test.local');
    assert.equal((await admin.patch(`/api/users/${temp.id}`, { active: false })).status, 204);
    assert.equal((await temp.get('/api/auth/me')).status, 401);
  });

  test('core M03 an administrator can set a new password for someone who is locked out, which signs them out everywhere', async () => {
    const locked = await t.user('locked@test.local');
    assert.equal((await ann.post(`/api/users/${locked.id}/password`, { next: 'set by a member?!' })).status, 403);
    assert.equal((await admin.post(`/api/users/${locked.id}/password`, { next: 'short' })).status, 422);
    assert.equal((await admin.post(`/api/users/${locked.id}/password`, { next: 'a new one from the admin' })).status, 204);
    assert.equal((await locked.get('/api/auth/me')).status, 401);
    const back = await t.client().post('/api/auth/login', { email: 'locked@test.local', password: 'a new one from the admin' });
    assert.equal(back.status, 200);
  });

  test('core M04 times of day follow the clock where the business is, summer time included', () => {
    assert.deepEqual(localParts(new Date('2026-07-01T08:00:00Z'), 'Europe/London'), { day: '2026-07-01', time: '09:00', weekday: 3 });
    assert.deepEqual(localParts(new Date('2026-01-15T09:00:00Z'), 'Europe/London'), { day: '2026-01-15', time: '09:00', weekday: 4 });
    assert.deepEqual(localParts(new Date('2026-03-01T20:30:00Z'), 'Asia/Kolkata'), { day: '2026-03-02', time: '02:00', weekday: 1 });
    assert.equal(zonedToUtc('2026-07-01', '09:00', 'Europe/London').toISOString(), '2026-07-01T08:00:00.000Z');
    assert.equal(zonedToUtc('2026-01-15', '09:00', 'Europe/London').toISOString(), '2026-01-15T09:00:00.000Z');
    assert.equal(zonedToUtc('2026-11-01', '09:00', 'America/New_York').toISOString(), '2026-11-01T14:00:00.000Z');
    assert.equal(zonedToUtc('2026-03-02', '02:00', 'Asia/Kolkata').toISOString(), '2026-03-01T20:30:00.000Z');
    assert.throws(() => zonedToUtc('2026-13-40', '09:00', 'UTC'), /Not a valid day/);
    // The app's clock can be set in a test.
    assert.equal(typeof t.config.now().getTime(), 'number');
  });

  test('core M03 the first administrator comes from the settings, not from whoever signs up first', async () => {
    const fresh = await startApp({ config: { ...CORE, adminEmail: 'boss@test.local', adminPassword: 'a long first password' } });
    const boss = fresh.client();
    const res = await boss.post('/api/auth/login', { email: 'boss@test.local', password: 'a long first password' });
    assert.equal(res.body.user.role, 'admin');
    const visitor = await fresh.client().post('/api/auth/signup', { email: 'first@test.local', name: 'First', password: 'long enough pw' });
    assert.equal(visitor.body.user.role, 'member');
    await fresh.stop();
  });

  // ---------------------------------------------------------------- M05 search, filter, sort, calculations

  test('core M05 lists can be searched, filtered, sorted and paged, with a total over everything that matches', async () => {
    const u = await t.user('lister@test.local');
    const items = [['Apple pie', 4, 'open'], ['Banana bread', 6, 'done'], ['Cherry tart', 9, 'open'], ['apple crumble', 5, 'done'], ['50% off sale', 1, 'open']];
    for (const [title, price, status] of items) await u.post('/api/_t/things', { title, price, status });

    const search = await u.get('/api/_t/things?q=apple&sort=title');
    assert.deepEqual(search.body.rows.map((r) => r.title), ['Apple pie', 'apple crumble']);
    const filtered = await u.get('/api/_t/things?status=open&min_price=4&sort=-price');
    assert.deepEqual(filtered.body.rows.map((r) => r.title), ['Cherry tart', 'Apple pie']);
    assert.equal(filtered.body.priceTotal, 13, 'the total follows the filters');
    const paged = await u.get('/api/_t/things?sort=price&page=2&page_size=2');
    assert.deepEqual(paged.body.rows.map((r) => r.price), [5, 6]);
    assert.equal(paged.body.total, 5);
    assert.equal(paged.body.pages, 3);
    assert.equal(paged.body.priceTotal, 25, 'the total covers every page, not just this one');
    // A percent sign typed into search means a percent sign, not "anything".
    const literal = await u.get('/api/_t/things?q=%25');
    assert.deepEqual(literal.body.rows.map((r) => r.title), ['50% off sale']);
  });

  test('core M05 list options that are not on the allowed list are ignored, not run', async () => {
    const u = await t.user('prober@test.local');
    await u.post('/api/_t/things', { title: 'Only one' });
    const res = await u.get(`/api/_t/things?sort=${encodeURIComponent('title; DROP TABLE t_things')}&page_size=99999&page=-3`);
    assert.equal(res.status, 200);
    assert.equal(res.body.pageSize, 100);
    assert.equal(res.body.page, 1);
    const search = await u.get(`/api/_t/things?q=${encodeURIComponent("' OR 1=1 --")}`);
    assert.equal(search.body.total, 0);
    assert.ok(t.db.prepare('SELECT COUNT(*) AS n FROM t_things').get().n > 0);
  });

  // ---------------------------------------------------------------- M06 errors and edge cases

  test('core M06 bad input is refused with a message for each field, and nothing is saved', async () => {
    const before = t.db.prepare('SELECT COUNT(*) AS n FROM t_things').get().n;
    const res = await ann.post('/api/_t/things', { title: '', price: -5, status: 'maybe', colour: 'red' });
    assert.equal(res.status, 422);
    assert.deepEqual(Object.keys(res.body.error.fields).sort(), ['colour', 'price', 'status', 'title']);
    assert.equal(t.db.prepare('SELECT COUNT(*) AS n FROM t_things').get().n, before);
    assert.throws(() => check({ when: '2026-02-30' }, { when: { type: 'date', required: true } }), /check the highlighted/);
    assert.equal(check({ n: '42' }, { n: { type: 'int' } }).n, 42);
  });

  test('core M06 the same action sent twice happens once', async () => {
    const key = 'double-click-1';
    const [a, b] = await Promise.all([
      ann.post('/api/_t/things', { title: 'Only once please' }, { 'Idempotency-Key': key }),
      ann.post('/api/_t/things', { title: 'Only once please' }, { 'Idempotency-Key': key }),
    ]);
    const later = await ann.post('/api/_t/things', { title: 'Only once please' }, { 'Idempotency-Key': key });
    assert.equal(t.db.prepare("SELECT COUNT(*) AS n FROM t_things WHERE title = 'Only once please'").get().n, 1);
    const ids = [a, b, later].filter((r) => r.status === 201).map((r) => r.body.id);
    assert.ok(ids.length >= 2, 'the repeat gets the first answer back');
    assert.equal(new Set(ids).size, 1);
    assert.equal(later.headers.get('idempotent-replay'), 'true');
  });

  test('core M06 when a step fails, the earlier steps of the same action are rolled back', () => {
    const before = t.db.prepare('SELECT COUNT(*) AS n FROM t_slots').get().n;
    assert.throws(() => tx(t.db, () => {
      t.db.prepare("INSERT INTO t_slots (name, remaining) VALUES ('half done', 1)").run();
      throw new Error('second step failed');
    }), /second step failed/);
    assert.equal(t.db.prepare('SELECT COUNT(*) AS n FROM t_slots').get().n, before);
    // A transaction may not wait for anything half-way: that is how double bookings happen.
    assert.throws(() => tx(t.db, async () => {}), /returned a promise/);
    assert.equal(t.db.prepare('SELECT COUNT(*) AS n FROM t_slots').get().n, before);
  });

  test('core M06 broken, oversized and unexpected requests get a clear answer and never a crash', async () => {
    const broken = await ann.post('/api/_t/things', '{"title": ', { 'Content-Type': 'application/json' });
    assert.equal(broken.status, 400);
    const own = (await ann.post('/api/_t/things', { title: 'Mine to edit' })).body.id;
    for (const odd of ['null', '[1, 2]', '"text"', '7']) {
      assert.equal((await ann.post('/api/_t/things', odd, { 'Content-Type': 'application/json' })).status, 400, odd);
      assert.equal((await ann.patch(`/api/_t/things/${own}`, odd, { 'Content-Type': 'application/json' })).status, 400, odd);
    }
    const form = await ann.post('/api/_t/things', 'title=x', { 'Content-Type': 'application/x-www-form-urlencoded' });
    assert.equal(form.status, 415);
    const huge = await ann.post('/api/_t/things', { title: 'x', notes: 'n'.repeat(200_000) });
    assert.equal(huge.status, 413);
    assert.equal((await ann.get('/api/no-such-thing')).status, 404);
    assert.equal((await ann.get('/api/_t/things/not-a-number')).status, 422);
    assert.equal((await ann.request('PUT', '/api/_t/things', {})).status, 405);
    const boom = await ann.get('/api/_t/boom');
    assert.equal(boom.status, 500);
    assert.ok(!boom.text.includes('secret internal detail'));
    assert.match(boom.body.error.message, /Reference: /);
    assert.equal((await ann.get('/api/health')).status, 200);       // still up
  });

  // ---------------------------------------------------------------- what an app builds on

  test('core M03 the People screen belongs to the first role, whatever the app calls it', async () => {
    const s = await startApp({ config: { roles: ['staff', 'member'], defaultRole: 'member', allowSignup: true } });
    try {
      const staff = await s.user('staff@test.local', 'staff');
      const member = await s.user('member@test.local');
      assert.equal((await staff.get('/api/users')).status, 200);
      assert.equal((await member.get('/api/users')).status, 403);
      const me = (await staff.get('/api/auth/me')).body;
      assert.deepEqual(me.roles, ['staff', 'member']);

      // The pages decide the same way: 'top' is the first role, not a fixed name.
      const page = await import('../public/js/api.js');
      const realFetch = globalThis.fetch;
      globalThis.fetch = async () => new Response(JSON.stringify(me), { status: 200, headers: { 'Content-Type': 'application/json' } });
      try { await page.loadSession(); } finally { globalThis.fetch = realFetch; }
      assert.equal(page.allows('top', 'staff'), true);
      assert.equal(page.allows('top', 'member'), false);
      assert.equal(page.allows('top', 'admin'), false);
      assert.equal(page.allows(['member'], 'member'), true);
      assert.equal(page.allows(null, 'member'), true);
      const js = path.resolve(import.meta.dirname, '../public/js');
      assert.match(fs.readFileSync(path.join(js, 'people.js'), 'utf8'), /startPage\('top'\)/);
      assert.match(fs.readFileSync(path.join(js, 'shell.js'), 'utf8'), /href: '\/people'[^\n]*roles: 'top'/);
    } finally { await s.stop(); }
  });

  test('core M03 a module can react when an account is created or changed, in the same transaction', async () => {
    const changes = [];
    const s = await startApp({
      config: CORE,
      setup({ db, auth }) {
        db.exec('CREATE TABLE t_profiles (user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, approved INTEGER NOT NULL DEFAULT 0)');
        auth.on('user.created', (user) => {
          if (user.email.startsWith('unlucky')) throw new Error('the profile could not be made');
          db.prepare('INSERT INTO t_profiles (user_id) VALUES (?)').run(user.id);
        });
        auth.on('user.changed', (user, before) => changes.push({ id: user.id, was: before.active, is: user.active, role: user.role }));
        assert.throws(() => auth.on('user.deleted', () => {}), /no event/);
      },
    });
    try {
      const boss = await s.user('boss@test.local', 'admin');
      const signup = await s.client().post('/api/auth/signup', { email: 'new@test.local', name: 'New', password: 'a long password' });
      assert.equal(signup.status, 201);
      const made = await boss.post('/api/users', { email: 'made@test.local', name: 'Made', role: 'member', password: 'a long password' });
      assert.equal(made.status, 201);
      assert.equal(s.db.prepare('SELECT COUNT(*) AS n FROM t_profiles').get().n, 3, 'one profile per account, however it was created');

      // If the listener fails, there is no half-made account.
      const unlucky = await s.client().post('/api/auth/signup', { email: 'unlucky@test.local', name: 'Unlucky', password: 'a long password' });
      assert.equal(unlucky.status, 500);
      assert.equal(s.db.prepare("SELECT COUNT(*) AS n FROM users WHERE email = 'unlucky@test.local'").get().n, 0);

      assert.equal((await boss.patch(`/api/users/${made.body.id}`, { active: false })).status, 204);
      assert.deepEqual(changes, [{ id: made.body.id, was: 1, is: 0, role: 'member' }]);

      // A listener that waits for something would run outside the transaction: refused.
      s.auth.on('user.created', async () => {});
      await assert.rejects(s.auth.createUser({ email: 'late@test.local', name: 'Late', password: 'a long password' }), /async/);
      assert.equal(s.db.prepare("SELECT COUNT(*) AS n FROM users WHERE email = 'late@test.local'").get().n, 0);
    } finally { await s.stop(); }
  });

  test('core M02 the first role can download a complete copy of the database; nobody else can', async () => {
    assert.equal((await t.client().get('/api/backup')).status, 401);
    assert.equal((await ann.get('/api/backup')).status, 403);
    const res = await fetch(`${t.base}/api/backup`, { headers: { Cookie: admin.cookie } });
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-disposition'), /^attachment; filename="[a-z0-9-]+-backup-\d{4}-\d{2}-\d{2}\.db"$/);
    const bytes = Buffer.from(await res.arrayBuffer());
    assert.equal(bytes.subarray(0, 15).toString('latin1'), 'SQLite format 3');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'restore-'));
    fs.writeFileSync(path.join(dir, 'copy.db'), bytes);
    const copy = openDb(path.join(dir, 'copy.db'));
    assert.equal(copy.prepare('SELECT COUNT(*) AS n FROM users').get().n, t.db.prepare('SELECT COUNT(*) AS n FROM users').get().n);
    assert.equal(copy.prepare('SELECT COUNT(*) AS n FROM t_things').get().n, t.db.prepare('SELECT COUNT(*) AS n FROM t_things').get().n);
    copy.close();
    fs.rmSync(dir, { recursive: true, force: true });
    assert.equal(t.db.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'backup.downloaded'").get().n, 1);
  });

  test('core M05 a list can be ordered by several columns at once, in either direction', async () => {
    const cara = await t.user('cara@test.local');
    for (const [title, status] of [['Pear', 'open'], ['Apple', 'done'], ['Fig', 'open'], ['Kiwi', 'done']]) {
      await cara.post('/api/_t/things', { title, status });
    }
    const order = async (sort) => (await cara.get(`/api/_t/things?sort=${sort}&page_size=50`)).body.rows.filter((r) => r.owner_id === cara.id).map((r) => r.title);
    assert.deepEqual(await order('by_status'), ['Apple', 'Kiwi', 'Fig', 'Pear']);       // status first, then title
    assert.deepEqual(await order('-by_status'), ['Pear', 'Fig', 'Kiwi', 'Apple']);
    assert.deepEqual(await order('title'), ['Apple', 'Fig', 'Kiwi', 'Pear']);
    assert.equal((await cara.get('/api/_t/things?sort=owner_id;DROP')).status, 200, 'an unknown order falls back to the default');
  });

  test('core M06 a list in a form is checked entry by entry', async () => {
    const DAYS = { days: { type: 'list', of: { type: 'int', min: 0, max: 6 }, minItems: 1, maxItems: 7, unique: true, label: 'Days' } };
    assert.deepEqual(check({ days: [1, '3', 5] }, DAYS), { days: [1, 3, 5] });
    const problem = (input) => { try { check(input, DAYS); return null; } catch (err) { return err.extra.fields.days; } };
    assert.match(problem({ days: '1,3' }), /must be a list/);
    assert.match(problem({ days: [1, 9] }), /entry 2 must be at most 6/);
    assert.match(problem({ days: [1, 'x'] }), /entry 2 must be a number/);
    assert.match(problem({ days: [1, null] }), /entry 2 is empty/);
    assert.match(problem({ days: [2, 2] }), /same entry twice/);
    assert.match(problem({ days: [] }), /at least 1 entry/);
    assert.match(problem({ days: [0, 1, 2, 3, 4, 5, 6, 0] }), /at most 7/);
    const made = await ann.post('/api/_t/things', { title: 'Open days', days: [1, 3] });
    assert.equal(made.status, 201);
    assert.equal(t.db.prepare('SELECT days FROM t_things WHERE id = ?').get(made.body.id).days, '[1,3]');
    assert.equal((await ann.post('/api/_t/things', { title: 'Bad days', days: [8] })).status, 422);
  });

  test('core M04 the clock is the business\'s: TIME_ZONE when set, otherwise this computer\'s own zone', () => {
    assert.equal(loadConfig({ TIME_ZONE: 'Asia/Tokyo' }).timeZone, 'Asia/Tokyo');
    assert.equal(loadConfig({}).timeZone, Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
    assert.equal(t.config.timeZone, 'UTC', 'tests run on UTC so they give the same answer everywhere');
  });

  // The command-line tools are what a person without a terminal habit is
  // given (through the .cmd files on Windows), so they are run for real here.
  const starter = path.resolve(import.meta.dirname, '..');
  const runTool = (file, args, { input = '', env = {} } = {}) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tool-'));
    const run = (more = []) => spawnSync(process.execPath, [path.join('tools', file), ...args, ...more], {
      cwd: starter, input, encoding: 'utf8', timeout: 60_000,
      env: { ...process.env, NODE_ENV: '', ADMIN_EMAIL: '', ADMIN_PASSWORD: '', DATA_DIR: dir, ...env },
    });
    return { dir, run, done: () => removeFolder(dir) };
  };

  test('core M03 an account can be made from the command line without typing a password anywhere', () => {
    const role = loadConfig({}).roles[0];
    const tool = runTool('add-user.js', ['--email', 'First@Test.local', '--name', 'First Person', '--generate']);
    try {
      const out = tool.run();
      assert.equal(out.status, 0, out.stderr);
      assert.ok(!out.stdout.includes('Role ('), 'with --generate, nothing is asked');
      const password = /Password: (\S+)/.exec(out.stdout)?.[1];
      assert.ok(password && password.length >= 12, 'a made-up password is shown once');
      const db = openDb(path.join(tool.dir, 'app.db'));
      const row = db.prepare('SELECT * FROM users').get();
      db.close();
      assert.equal(row.email, 'first@test.local');
      assert.equal(row.role, role, 'the first role, when none is named');
      assert.ok(!row.password_hash.includes(password));
      // The same account twice is refused, in words.
      const again = tool.run();
      assert.equal(again.status, 1);
      assert.match(again.stderr, /already an account/);
    } finally { tool.done(); }

    // Every answer can also arrive on standard input, as when another program drives it.
    const piped = runTool('add-user.js', [], { input: 'second@test.local\nSecond Person\n\n\n' });
    try {
      const out = piped.run();
      assert.equal(out.status, 0, out.stderr);
      assert.match(out.stdout, /Created \S+ account for second@test\.local/);
      assert.match(out.stdout, /Password: \S{12,}/);
    } finally { piped.done(); }

    const bad = runTool('add-user.js', ['--email', 'not-an-email', '--generate']);
    try { assert.equal(bad.run().status, 1); } finally { bad.done(); }
  });

  test('core M02 example data loads once, with made-up passwords, and not on the live app by accident', () => {
    const roles = loadConfig({}).roles;
    const tool = runTool('seed.js', []);
    try {
      const first = tool.run();
      assert.equal(first.status, 0, first.stderr);
      for (const role of roles) assert.match(first.stdout, new RegExp(`${role}@example\\.com\\s+\\S{12}`));
      const db = openDb(path.join(tool.dir, 'app.db'));
      // Every account it made is one it showed a password for: one per role, plus any in EXTRA_ACCOUNTS.
      const shown = first.stdout.match(/^\s+\S+\s+\S+@example\.com\s+\S{12}$/gm) || [];
      assert.ok(shown.length >= roles.length);
      assert.equal(db.prepare("SELECT COUNT(*) AS n FROM users WHERE email LIKE '%@example.com'").get().n, shown.length);
      assert.equal(db.prepare("SELECT COUNT(*) AS n FROM users WHERE password_hash NOT LIKE 'scrypt$%'").get().n, 0, 'every example account can sign in: none was inserted by hand');
      db.close();
      const second = tool.run();
      assert.equal(second.status, 1);
      assert.match(second.stderr, /already loaded/);
    } finally { tool.done(); }

    const live = runTool('seed.js', [], { env: { NODE_ENV: 'production' } });
    try {
      const out = live.run();
      assert.equal(out.status, 1);
      assert.match(out.stderr, /live app/);
      assert.ok(!fs.existsSync(path.join(live.dir, 'app.db')), 'nothing is created');
    } finally { live.done(); }
  });

  test('core M08 the double-click files for Windows are complete', () => {
    const files = { 'start-app.cmd': 'server.js', 'add-account.cmd': 'tools\\add-user.js', 'load-example-data.cmd': 'tools\\seed.js' };
    for (const [name, runs] of Object.entries(files)) {
      const text = fs.readFileSync(path.join(starter, name), 'utf8');
      assert.ok(text.includes(`node ${runs}`), `${name} runs ${runs}`);
      assert.ok(fs.existsSync(path.join(starter, ...runs.split('\\'))), `${runs} exists`);
      assert.ok(text.includes('\r\n') && !/[^\r]\n/.test(text), `${name} has Windows line endings (batch files misbehave without them)`);
      assert.ok(!/localhost:\d+/.test(text), `${name} does not promise an address; the app prints the real one`);
    }
  });

  test('core M03 after signing out, the Back button does not bring the last person\'s page back', async () => {
    // A browser keeps the page it just left and shows it again on Back without
    // asking anyone. The page library hides and reloads a page that returns
    // that way. Here the browser is played by three small stand-ins.
    const page = await import('../public/js/api.js');
    const me = (await ann.get('/api/auth/me')).body;
    const real = { fetch: globalThis.fetch, window: globalThis.window, document: globalThis.document, location: globalThis.location };
    const handlers = {};
    let reloads = 0;
    globalThis.fetch = async () => new Response(JSON.stringify(me), { status: 200, headers: { 'Content-Type': 'application/json' } });
    globalThis.window = { addEventListener: (type, fn) => { handlers[type] = fn; } };
    globalThis.document = { documentElement: { hidden: false } };
    globalThis.location = { pathname: '/things', href: '', reload: () => { reloads++; } };
    try {
      assert.equal((await page.requireSession()).email, 'ann@test.local');
      assert.equal(typeof handlers.pageshow, 'function', 'every page for signed-in people listens for coming back');
      handlers.pageshow({ persisted: false });                 // an ordinary load: nothing to do
      assert.equal(reloads, 0);
      assert.equal(globalThis.document.documentElement.hidden, false);
      handlers.pageshow({ persisted: true });                  // brought back by Back or Forward, exactly as it was
      assert.equal(globalThis.document.documentElement.hidden, true, 'hidden at once');
      assert.equal(reloads, 1, 'and loaded afresh, which sends a signed-out visitor to sign in');
    } finally {
      for (const [name, value] of Object.entries(real)) { if (value === undefined) delete globalThis[name]; else globalThis[name] = value; }
    }
    // Signed-in pages get it by starting with startPage(), which asks for the session.
    const js = path.resolve(import.meta.dirname, '../public/js');
    assert.match(fs.readFileSync(path.join(js, 'shell.js'), 'utf8'), /await requireSession\(roles\)/);
    assert.match(fs.readFileSync(path.resolve(import.meta.dirname, '../public/app.css'), 'utf8'), /\[hidden\]\s*\{\s*display:\s*none\s*!important/);
  });

  test('core M06 an edit that does not say which version it started from is a mistake in the request, not "someone else changed this"', async () => {
    const made = await ann.post('/api/_t/things', { title: 'Versioned' });
    const url = `/api/_t/things/${made.body.id}`;
    for (const body of [{ title: 'No version' }, { title: 'Not a number', version: 'two' }, { title: 'Half', version: 1.5 }, { title: 'Empty', version: '' }, { title: 'Null', version: null }]) {
      const res = await ann.patch(url, body);
      assert.equal(res.status, 422, JSON.stringify(body));
      assert.ok(res.body.error.fields.version, 'the field at fault is named');
      assert.ok(!/someone else/i.test(res.body.error.message));
    }
    assert.equal((await ann.get(url)).body.thing.title, 'Versioned', 'nothing was saved');
    assert.equal((await ann.patch(url, { title: 'Saved', version: 1 })).status, 200);
    // A real conflict still says so.
    const stale = await ann.patch(url, { title: 'Late', version: 1 });
    assert.equal(stale.status, 409);
    assert.match(stale.body.error.message, /Someone else/);
  });

  test('core M02 the edit and take-one helpers work on a table that is not keyed by id', () => {
    t.db.exec('CREATE TABLE t_keyed (user_id INTEGER PRIMARY KEY REFERENCES users(id), nickname TEXT, credits INTEGER NOT NULL DEFAULT 0 CHECK (credits >= 0), version INTEGER NOT NULL DEFAULT 1, updated_at TEXT)');
    t.db.prepare('INSERT INTO t_keyed (user_id, credits) VALUES (?, 1), (?, 5)').run(ann.id, ben.id);
    const key = { key: 'user_id' };
    const saved = updateVersioned(t.db, 't_keyed', ann.id, 1, { nickname: 'Annie' }, ['nickname'], key);
    assert.equal(saved.nickname, 'Annie');
    assert.equal(saved.version, 2);
    assert.throws(() => updateVersioned(t.db, 't_keyed', ann.id, 1, { nickname: 'Late' }, ['nickname'], key), /Someone else/);
    assert.equal(takeOne(t.db, 't_keyed', ann.id, 'credits', 1, key), true);
    assert.equal(takeOne(t.db, 't_keyed', ann.id, 'credits', 1, key), false, 'none left');
    assert.equal(giveBack(t.db, 't_keyed', ann.id, 'credits', 1, key), true);
    assert.equal(giveBack(t.db, 't_keyed', 999999, 'credits', 1, key), false, 'nobody to give it back to');
    assert.deepEqual(t.db.prepare('SELECT user_id, credits FROM t_keyed ORDER BY user_id').all().map((r) => r.credits), [1, 5], "the other person's row was not touched");
    t.db.exec('DROP TABLE t_keyed');
  });

  test('core M05 a filter is checked like a form field, can be worked out, and a figure can count rows that meet a condition', async () => {
    const u = await t.user('filters@test.local');
    for (const [title, price, status] of [['Kettle', 10, 'open'], ['Lamp', 20, 'done'], ['Mug', 5, 'open']]) await u.post('/api/_t/things', { title, price, status });
    await ann.post('/api/_t/things', { title: 'Not theirs', price: 100, status: 'open' });

    const wrong = await u.get('/api/_t/things?status=maybe');
    assert.equal(wrong.status, 422, 'a value the filter does not know is refused, not answered with an empty list');
    assert.match(wrong.body.error.fields.status, /open, done/);
    assert.equal((await u.get('/api/_t/things?min_price=cheap')).status, 422);
    assert.equal((await u.get('/api/_t/things?mine=perhaps')).status, 422);

    // The list an administrator sees holds everyone's; ?mine=1 is a condition worked out from who is asking.
    const all = await admin.get('/api/_t/things?q=e&page_size=100');
    const mine = await admin.get('/api/_t/things?mine=1');
    assert.ok(all.body.total > mine.body.total);
    assert.equal((await admin.get('/api/_t/things?mine=0&q=e&page_size=100')).body.total, all.body.total, 'a where function may answer "no condition"');

    const figures = await u.get('/api/_t/things?page_size=1');
    assert.equal(figures.body.rows.length, 1);
    assert.equal(figures.body.sums.openCount, 2, 'counted over every match, not just the page shown');
    assert.equal(figures.body.sums.priceTotal, 35);
    assert.ok(Math.abs(figures.body.sums.withTax - 42) < 1e-9, 'an expression with its own value, added up');
    assert.equal((await u.get('/api/_t/things?status=done')).body.sums.openCount, 0, 'figures follow the filters');
  });

  test('core M05 the People list is searched, filtered, ordered and paged by the database, with a count of who can sign in', async () => {
    const s = await startApp({ config: { roles: ['staff', 'member'], defaultRole: 'member', allowSignup: true } });
    try {
      const staff = await s.user('zoe@test.local', 'staff');
      for (let i = 1; i <= 23; i++) await s.user(`person${String(i).padStart(2, '0')}@test.local`);
      await staff.patch(`/api/users/${s.db.prepare("SELECT id FROM users WHERE email = 'person05@test.local'").get().id}`, { active: false });

      const first = await staff.get('/api/users');
      assert.equal(first.body.total, 24);
      assert.equal(first.body.rows.length, 20, 'a page at a time');
      assert.equal(first.body.pages, 2);
      assert.deepEqual(first.body.users, first.body.rows, 'the old name for the rows still works');
      assert.equal(first.body.sums.canSignIn, 23);
      assert.equal((await staff.get('/api/users?page=2')).body.rows.length, 4);
      assert.deepEqual((await staff.get('/api/users?q=person1')).body.rows.map((r) => r.name), ['person10', 'person11', 'person12', 'person13', 'person14', 'person15', 'person16', 'person17', 'person18', 'person19']);
      assert.deepEqual((await staff.get('/api/users?role=staff')).body.rows.map((r) => r.email), ['zoe@test.local']);
      assert.deepEqual((await staff.get('/api/users?active=0')).body.rows.map((r) => r.name), ['person05']);
      assert.equal((await staff.get('/api/users?sort=-name')).body.rows[0].name, 'zoe');
      assert.equal((await staff.get('/api/users?role=boss')).status, 422);
      assert.ok(!('password_hash' in first.body.rows[0]));
      // The screen uses the shared list and asks before switching an account off.
      const screen = fs.readFileSync(path.resolve(import.meta.dirname, '../public/js/people.js'), 'utf8');
      assert.match(screen, /createList\(\{/);
      assert.match(screen, /await ask\(\{/);
    } finally { await s.stop(); }
  });

  test('core M04 a refusal can name the rule behind it, for the page and for a test', async () => {
    const limit = await ann.post('/api/_t/refuse', { why: 'limit' });
    assert.equal(limit.status, 409);
    assert.equal(limit.body.error.rule, 'max_open');
    assert.match(limit.body.error.message, /at most 3/);
    const approval = await ann.post('/api/_t/refuse', { why: 'approval' });
    assert.equal(approval.status, 403);
    assert.equal(approval.body.error.rule, 'not_approved');
    // The page reads it as err.rule.
    const page = await import('../public/js/api.js');
    assert.equal(new page.ApiError(409, limit.body).rule, 'max_open');
    assert.equal(new page.ApiError(403, { error: { message: 'No.' } }).rule, null);
  });

  test('core M07 a part of the page that is missing is left out, never printed as the word "null"', async () => {
    const page = await import('../public/js/api.js');
    const real = { Node: globalThis.Node, document: globalThis.document };
    globalThis.Node = class {};
    globalThis.document = { createTextNode: (text) => ({ text }) };
    try {
      const made = new globalThis.Node();
      const node = { replaceChildren(...kids) { this.kids = kids; } };
      page.fill(node, 'Page 1 of 3', null, [false, made, undefined], 0);
      assert.deepEqual(node.kids, [{ text: 'Page 1 of 3' }, made, { text: '0' }]);
      page.fill(node);
      assert.deepEqual(node.kids, []);
    } finally {
      for (const [name, value] of Object.entries(real)) { if (value === undefined) delete globalThis[name]; else globalThis[name] = value; }
    }
  });

  test('core M08 every page carries the app\'s name from config.js, and the starter\'s stand-in name is gone from pages and scripts', () => {
    const { appName } = loadConfig({});
    const dir = path.resolve(import.meta.dirname, '../public');
    for (const name of fs.readdirSync(dir).filter((f) => f.endsWith('.html'))) {
      const title = /<title>([^<]*)<\/title>/.exec(fs.readFileSync(path.join(dir, name), 'utf8'))[1];
      assert.ok(title.includes(appName), `${name}: the title "${title}" does not carry the app's name from config.js, "${appName}"`);
    }
    const everything = [...fs.readdirSync(dir).filter((f) => /\.(html|webmanifest)$/.test(f)).map((f) => path.join(dir, f)),
      ...fs.readdirSync(path.join(dir, 'js')).map((f) => path.join(dir, 'js', f))];
    for (const file of everything) {
      const text = fs.readFileSync(file, 'utf8');
      if (appName !== 'My app') assert.ok(!text.includes('My app'), `${path.relative(dir, file)} still says "My app", the starter's stand-in name`);
    }
  });

  test('core M02 the example data can include more people than one per role, each with a real password', () => {
    const seed = path.join(starter, 'tools', 'seed.js');
    const source = fs.readFileSync(seed, 'utf8');
    const example = "  // { key: 'member2', role: 'member', name: 'Second example member' },";
    const role = loadConfig({}).roles.at(-1);
    // An app that has filled in its own extra accounts is checked as it is, by the test above.
    if (!source.includes(example)) return;
    const copy = path.join(starter, 'tools', 'seed-with-extras.test-copy.js');
    fs.writeFileSync(copy, source.replace(example, `  { key: 'extra-one', role: '${role}', name: 'Extra One' },`));
    const tool = runTool('seed-with-extras.test-copy.js', ['--json']);
    try {
      const out = tool.run();
      assert.equal(out.status, 0, out.stderr);
      const { accounts } = JSON.parse(out.stdout.trim());
      const extra = accounts.find((a) => a.email === 'extra-one@example.com');
      assert.ok(extra, 'the extra account is listed with the others');
      assert.equal(extra.role, role);
      assert.ok(extra.password.length >= 12);
      assert.equal(accounts.length, loadConfig({}).roles.length + 1);
      const db = openDb(path.join(tool.dir, 'app.db'));
      const row = db.prepare("SELECT * FROM users WHERE email = 'extra-one@example.com'").get();
      db.close();
      assert.match(row.password_hash, /^scrypt\$/, 'a real password, so this person can sign in');
      assert.equal(row.name, 'Extra One');
    } finally { tool.done(); fs.rmSync(copy, { force: true }); }
  });

  test('core M07 the tool that looks at every screen in a browser is in place', () => {
    const look = fs.readFileSync(path.join(starter, 'tools', 'look.js'), 'utf8');
    assert.match(look, /history\.back\(\)/, 'it presses Back after signing out');
    assert.match(look, /seed\.js/, 'it signs in as the example accounts');
    assert.equal(spawnSync(process.execPath, ['--check', path.join('tools', 'look.js')], { cwd: starter }).status, 0);
    assert.match(fs.readFileSync(path.join(starter, '.gitignore'), 'utf8'), /^look\/$/m, 'its pictures are not committed');
  });

  // ---------------------------------------------------------------- M07 pages

  test('core M07 every page is set up for phones and screen readers', () => {
    const dir = path.resolve(import.meta.dirname, '../public');
    for (const name of fs.readdirSync(dir).filter((f) => f.endsWith('.html'))) {
      const html = fs.readFileSync(path.join(dir, name), 'utf8');
      assert.match(html, /<html lang="[a-z-]+"/i, `${name}: language`);
      assert.match(html, /name="viewport" content="width=device-width, initial-scale=1"/, `${name}: viewport`);
      assert.match(html, /<title>[^<]{3,}<\/title>/, `${name}: title`);
      assert.equal((html.match(/<h1[\s>]/g) || []).length, 1, `${name}: one main heading`);
      assert.match(html, /<main[\s>]/, `${name}: main landmark`);
      for (const input of html.match(/<(input|select|textarea)\b[^>]*>/g) || []) {
        const id = /\bid="([^"]+)"/.exec(input);
        assert.ok(id && html.includes(`<label for="${id[1]}"`), `${name}: a label for ${input}`);
      }
      assert.ok(!/<script(?![^>]*\bsrc=)/.test(html), `${name}: no inline scripts (the security policy blocks them)`);
      assert.ok(!/<style[\s>]/.test(html) && !/\sstyle\s*=/.test(html), `${name}: no styles written into the page (the security policy ignores them, silently; use a class in app.css)`);
    }
    // The browser's replaceChildren() prints the word "null" for a part that is missing; fill() leaves it out.
    const js = path.join(dir, 'js');
    for (const name of fs.readdirSync(js).filter((f) => f.endsWith('.js') && f !== 'api.js')) {
      assert.ok(!/\.replaceChildren\(/.test(fs.readFileSync(path.join(js, name), 'utf8')), `js/${name}: use fill(node, ...) from api.js in place of node.replaceChildren(...)`);
    }
  });

  test('core M07 pages and files are served safely', async () => {
    const page = await t.client().get('/login');
    assert.equal(page.status, 200);
    assert.match(page.headers.get('content-type'), /text\/html/);
    assert.match(page.headers.get('content-security-policy'), /script-src 'self'/);
    assert.equal(page.headers.get('x-content-type-options'), 'nosniff');
    // After an update people get the new files: the browser must ask before reusing a copy.
    const script = await t.client().get('/js/api.js');
    assert.equal(script.headers.get('cache-control'), 'no-cache');
    // Pages are not kept at all, so Back after signing out has nothing to show (the M03 test has the other half).
    assert.equal(page.headers.get('cache-control'), 'no-store');
    assert.equal((await t.client().get('/')).headers.get('cache-control'), 'no-store');
    const again = await t.client().get('/js/api.js', { 'If-Modified-Since': script.headers.get('last-modified') });
    assert.equal(again.status, 304);
    assert.equal((await t.client().get('/nothing-here')).status, 404);
    for (const sneaky of ['/..%2f..%2fpackage.json', '/%2e%2e/%2e%2e/server.js', '/js/..%2f..%2fconfig.js']) {
      const res = await t.client().get(sneaky);
      assert.equal(res.status, 404, sneaky);
      assert.ok(!res.text.includes('loadConfig'), sneaky);
    }
  });
});

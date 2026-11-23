// Tests for the core, named by requirement id (see tools/rubric.js).
// They cover what the core gives every app. M01, M04 and M08 are about your
// own modules and deployment, so their tests live in your module test files.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import { hashPassword, verifyPassword } from '../core/auth.js';
import { migrate, openDb, tx } from '../core/db.js';
import { localParts, zonedToUtc } from '../core/time.js';
import { check } from '../core/validate.js';
import { CORE, setupFixture } from './fixture.js';
import { startApp } from './helpers.js';

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
    for (const odd of ['null', '[1, 2]', '"text"', '7']) {
      assert.equal((await ann.post('/api/_t/things', odd, { 'Content-Type': 'application/json' })).status, 400, odd);
      assert.equal((await ann.patch('/api/_t/things/1', odd, { 'Content-Type': 'application/json' })).status, 400, odd);
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

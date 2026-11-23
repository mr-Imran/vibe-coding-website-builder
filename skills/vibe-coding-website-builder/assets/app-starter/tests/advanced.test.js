// Tests for the advanced building blocks, each using the test the requirement
// names. An app that builds one of these features adds its own test with the
// same id, on its own data, in its module test file.

import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import http from 'node:http';
import path from 'node:path';
import { promisify } from 'node:util';
import { after, before, describe, test } from 'node:test';
import { importCsv, parseCsv, stats } from '../core/csv.js';
import { tx } from '../core/db.js';
import { callExternal, resetBreakers } from '../core/external.js';
import { solveAssignment } from '../core/solve.js';
import { defineWorkflow, describe as describeRun, recoverWorkflows, runWorkflow } from '../core/workflow.js';
import { createOutbox, memoryStore, threeWayMerge } from '../public/js/merge.js';
import { CORE, setupFixture } from './fixture.js';
import { startApp } from './helpers.js';

describe('advanced', () => {
  let t;
  let admin;
  let ann;
  let ben;

  before(async () => {
    t = await startApp({ setup: setupFixture, config: CORE });
    admin = await t.user('admin@adv.local', 'admin');
    ann = await t.user('ann@adv.local');
    ben = await t.user('ben@adv.local');
  });
  after(async () => { await t.stop(); });

  // ---------------------------------------------------------------- A01 real-time sync

  test('core A01 two people save the same record at the same moment: one wins, the other is told and nothing is overwritten', async () => {
    const id = (await admin.post('/api/_t/things', { title: 'Shared plan', notes: 'v1' })).body.id;
    t.db.prepare('UPDATE t_things SET shared = 1 WHERE id = ?').run(id);
    const second = await t.user('admin2@adv.local', 'admin');

    const [a, b] = await Promise.all([
      admin.patch(`/api/_t/things/${id}`, { notes: 'from the first', version: 1 }),
      second.patch(`/api/_t/things/${id}`, { notes: 'from the second', version: 1 }),
    ]);
    const statuses = [a.status, b.status].sort();
    assert.deepEqual(statuses, [200, 409]);
    const loser = a.status === 409 ? a : b;
    const winner = a.status === 200 ? a : b;
    // The loser receives the record as it now is, so the screen can show both versions.
    assert.equal(loser.body.error.current.notes, winner.body.thing.notes);
    assert.equal(loser.body.error.current.version, 2);
    assert.equal(t.db.prepare('SELECT notes, version FROM t_things WHERE id = ?').get(id).version, 2);
    // Saving again on top of the current version works.
    const retry = await (a.status === 409 ? admin : second).patch(`/api/_t/things/${id}`, { notes: 'merged by hand', version: 2 });
    assert.equal(retry.status, 200);
    assert.equal(retry.body.thing.version, 3);
  });

  test('core A01 a save reaches everyone who may see the record, live, and nobody else', async () => {
    const id = (await ann.post('/api/_t/things', { title: 'Private to Ann' })).body.id;
    const annStream = await ann.events();
    const benStream = await ben.events();
    const adminStream = await admin.events();
    assert.equal(annStream.status, 200);

    await ann.patch(`/api/_t/things/${id}`, { title: 'Private to Ann, edited', version: 1 });
    assert.deepEqual(await annStream.next(), { type: 'thing.changed', data: { id, version: 2 } });
    assert.deepEqual(await adminStream.next(), { type: 'thing.changed', data: { id, version: 2 } });
    assert.equal(await benStream.next(300), null, 'Ben may not see this record, so he hears nothing about it');

    annStream.close(); benStream.close(); adminStream.close();
    assert.equal((await t.client().get('/api/events')).status, 401);
  });

  // ---------------------------------------------------------------- A02 decisions and optimization

  const staff = [
    { name: 'Asha', skills: ['till', 'kitchen'], maxHours: 8, rate: 14 },
    { name: 'Bo', skills: ['till'], maxHours: 4, rate: 11 },
    { name: 'Cy', skills: ['kitchen'], maxHours: 8, rate: 16 },
  ];
  const hoursOf = (person, plan) => plan.filter((p) => p.option === person).reduce((sum, p) => sum + p.item.hours, 0);
  const rules = [
    (shift, person) => person.skills.includes(shift.skill) || `${person.name} is not trained for ${shift.skill}`,
    (shift, person, plan) => hoursOf(person, plan) + shift.hours <= person.maxHours || `${person.name} would work more than ${person.maxHours} hours`,
  ];
  const cost = (shift, person) => person.rate * shift.hours;

  test('core A02 finds the cheapest plan that breaks no rule, the same way every time', () => {
    const shifts = [
      { name: 'Morning till', skill: 'till', hours: 4 },
      { name: 'Lunch kitchen', skill: 'kitchen', hours: 4 },
      { name: 'Evening till', skill: 'till', hours: 4 },
    ];
    const first = solveAssignment({ items: shifts, options: staff, rules, cost });
    assert.equal(first.ok, true);
    assert.equal(first.optimal, true);
    const who = Object.fromEntries(first.plan.map((p) => [p.item.name, p.option.name]));
    // Bo is cheapest on the till but may only work 4 hours, so he gets one till
    // shift and Asha, the next cheapest, takes the other and the kitchen.
    assert.equal(who['Lunch kitchen'], 'Asha');
    assert.deepEqual([who['Morning till'], who['Evening till']].sort(), ['Asha', 'Bo']);
    assert.equal(first.cost, 11 * 4 + 14 * 4 + 14 * 4);
    assert.deepEqual(solveAssignment({ items: shifts, options: staff, rules, cost }), first);
  });

  test('core A02 an impossible request is refused with the reasons, and nothing is planned', () => {
    const result = solveAssignment({ items: [{ name: 'Night security', skill: 'security', hours: 8 }], options: staff, rules, cost });
    assert.equal(result.ok, false);
    assert.equal(result.blocked[0].item, 'Night security');
    assert.equal(result.blocked[0].reasons.length, 3);
    assert.match(result.blocked[0].reasons.join(' '), /Asha is not trained for security/);
    assert.equal(result.plan, undefined);
  });

  test('core A02 rules that each can be met but not together are reported as a conflict', () => {
    // Three 4-hour kitchen shifts; kitchen staff have 8 + 8 hours, but Asha is also the only one left for a till shift.
    const shifts = [
      { name: 'Kitchen 1', skill: 'kitchen', hours: 8 },
      { name: 'Kitchen 2', skill: 'kitchen', hours: 8 },
      { name: 'Kitchen 3', skill: 'kitchen', hours: 4 },
    ];
    const result = solveAssignment({ items: shifts, options: staff, rules, cost });
    assert.equal(result.ok, false);
    assert.match(result.reason, /cannot all be met together/);
    assert.match(result.blocked[0].reasons.join(' '), /would work more than 8 hours/);
  });

  // ---------------------------------------------------------------- A03 access control

  test("core A03 a user cannot read, change or delete another user's restricted record, even by guessing its number", async () => {
    const id = (await ann.post('/api/_t/things', { title: "Ann's private notes", notes: 'salary: 1' })).body.id;
    const before = t.db.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'access.denied'").get().n;

    assert.equal((await ben.get(`/api/_t/things/${id}`)).status, 404);
    assert.equal((await ben.patch(`/api/_t/things/${id}`, { title: 'taken over', version: 1 })).status, 404);
    assert.equal((await ben.delete(`/api/_t/things/${id}`)).status, 404);
    // It answers exactly like a record that does not exist, so numbers cannot be probed.
    assert.deepEqual((await ben.get(`/api/_t/things/${id}`)).body, (await ben.get('/api/_t/things/987654')).body);

    const row = t.db.prepare('SELECT title, notes FROM t_things WHERE id = ?').get(id);
    assert.deepEqual({ ...row }, { title: "Ann's private notes", notes: 'salary: 1' });
    // Every refused attempt is on record: the three above and the repeat read.
    assert.equal(t.db.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'access.denied'").get().n, before + 4);
    assert.ok(!(await ben.get('/api/_t/things?page_size=100')).body.rows.some((r) => r.id === id), 'and it is not in his list either');
    // The same request from the owner works.
    assert.equal((await ann.patch(`/api/_t/things/${id}`, { title: 'still mine', version: 1 })).status, 200);
  });

  test('core A03 seeing a record does not mean being allowed to change it', async () => {
    const id = (await ann.post('/api/_t/things', { title: 'Shared, read-only for others' })).body.id;
    t.db.prepare('UPDATE t_things SET shared = 1 WHERE id = ?').run(id);
    assert.equal((await ben.get(`/api/_t/things/${id}`)).status, 200);
    assert.equal((await ben.patch(`/api/_t/things/${id}`, { title: 'edited by Ben', version: 1 })).status, 403);
    assert.equal((await ben.delete(`/api/_t/things/${id}`)).status, 403);
    // Ownership cannot be handed over through the request either.
    assert.equal((await ben.patch(`/api/_t/things/${id}`, { owner_id: ben.id, version: 1 })).status, 422);
    assert.equal(t.db.prepare('SELECT owner_id FROM t_things WHERE id = ?').get(id).owner_id, ann.id);
  });

  // ---------------------------------------------------------------- A04 offline-first

  test('core A04 edits to different fields merge by themselves; edits to the same field are a conflict for a person to settle', () => {
    const base = { id: 1, version: 3, title: 'Fix roof', notes: 'call builder', status: 'open' };
    const mine = { ...base, notes: 'call builder on Monday' };
    const theirs = { ...base, version: 4, status: 'done' };
    const easy = threeWayMerge(base, mine, theirs, ['title', 'notes', 'status']);
    assert.equal(easy.clean, true);
    assert.deepEqual(easy.merged, { id: 1, version: 4, title: 'Fix roof', notes: 'call builder on Monday', status: 'done' });

    const clash = threeWayMerge(base, { ...base, title: 'Fix the roof' }, { ...base, version: 4, title: 'Repair roof' }, ['title', 'notes', 'status']);
    assert.equal(clash.clean, false);
    assert.deepEqual(clash.conflicts, [{ field: 'title', base: 'Fix roof', mine: 'Fix the roof', theirs: 'Repair roof' }]);
    assert.equal(clash.merged.title, 'Repair roof', 'the server copy stays until a person chooses');
  });

  test('core A04 an edit made offline conflicts with one made meanwhile: the person chooses, and neither edit is lost silently', async () => {
    const id = (await ann.post('/api/_t/things', { title: 'Shopping', notes: 'milk' })).body.id;
    const base = (await ann.get(`/api/_t/things/${id}`)).body.thing;

    // Ann's phone is offline. Her edit waits in the outbox.
    let online = false;
    const asked = [];
    const outbox = createOutbox({
      store: memoryStore(),
      send: async (entry) => {
        if (!online) { const e = new Error('offline'); e.status = 0; throw e; }
        const res = await ann.request(entry.method, entry.url, entry.body, { 'Idempotency-Key': entry.key });
        if (res.status >= 400) { const e = new Error(res.body.error.message); e.status = res.status; e.current = res.body.error.current; throw e; }
        return res.body;
      },
      onConflict: async (entry, current) => {
        const merge = threeWayMerge(entry.base, { ...entry.base, ...entry.body }, current, entry.fields);
        asked.push(merge.conflicts.map((c) => c.field));
        return 'mine';
      },
    });
    await outbox.add({ method: 'PATCH', url: `/api/_t/things/${id}`, body: { notes: 'milk, eggs', version: base.version }, base, fields: ['title', 'notes'] });
    assert.deepEqual(await outbox.flush(), { sent: 0, kept: 1, conflicts: 0, dropped: [] });

    // Meanwhile the same record is changed from her laptop.
    assert.equal((await ann.patch(`/api/_t/things/${id}`, { notes: 'milk, bread', version: base.version })).status, 200);

    // The phone comes back online.
    online = true;
    const report = await outbox.flush();
    assert.equal(report.conflicts, 1);
    assert.equal(report.sent, 1);
    assert.deepEqual(asked, [['notes']], 'the person was asked about exactly the field both sides changed');
    assert.equal(await outbox.pending(), 0);
    const final = t.db.prepare('SELECT notes, version FROM t_things WHERE id = ?').get(id);
    assert.equal(final.notes, 'milk, eggs');
    assert.equal(final.version, 3);
  });

  test('core A04 an action whose answer was lost on a bad connection is not carried out twice when it is sent again', async () => {
    let attempt = 0;
    const outbox = createOutbox({
      store: memoryStore(),
      send: async (entry) => {
        const res = await ann.request(entry.method, entry.url, entry.body, { 'Idempotency-Key': entry.key });
        attempt++;
        if (attempt === 1) { const e = new Error('connection dropped before the answer arrived'); e.status = 0; throw e; }
        return res.body;
      },
      onConflict: async () => 'theirs',
    });
    await outbox.add({ method: 'POST', url: '/api/_t/things', body: { title: 'Sent on a train' } });
    assert.equal((await outbox.flush()).kept, 1);
    assert.equal((await outbox.flush()).sent, 1);
    assert.equal(t.db.prepare("SELECT COUNT(*) AS n FROM t_things WHERE title = 'Sent on a train'").get().n, 1);
  });

  // ---------------------------------------------------------------- A05 concurrency and transactions

  test('core A05 twenty people ask for the last one at once: exactly one gets it and the count never goes below zero', async () => {
    const slotId = Number(t.db.prepare("INSERT INTO t_slots (name, remaining) VALUES ('Last seat', 1)").run().lastInsertRowid);
    const people = await Promise.all(Array.from({ length: 20 }, (_, i) => t.user(`racer${i}@adv.local`)));
    const results = await Promise.all(people.map((p) => p.post(`/api/_t/slots/${slotId}/claim`, {})));
    const statuses = results.map((r) => r.status);
    assert.equal(statuses.filter((s) => s === 201).length, 1);
    assert.equal(statuses.filter((s) => s === 409).length, 19);
    assert.equal(t.db.prepare('SELECT remaining FROM t_slots WHERE id = ?').get(slotId).remaining, 0);
    assert.equal(t.db.prepare('SELECT COUNT(*) AS n FROM t_claims WHERE slot_id = ?').get(slotId).n, 1);
    assert.match(results.find((r) => r.status === 409).body.error.message, /taken/);
  });

  test('core A05 four separate programs fight over five places in one database file: five are given out, never six', async () => {
    // A race inside one program can pass by luck of timing. Separate programs
    // really do run at the same moment; only the database can keep them apart.
    const stock = 5;
    const each = 10;
    const workers = 4;
    const slotId = Number(t.db.prepare("INSERT INTO t_slots (name, remaining) VALUES ('Five places', ?)").run(stock).lastInsertRowid);
    const insert = t.db.prepare("INSERT INTO users (email, name, password_hash, role, created_at) VALUES (?, 'Racer', 'x', 'member', 'now')");
    const firstUsers = [];
    for (let w = 0; w < workers; w++) {
      firstUsers.push(Number(insert.run(`proc${w}-0@adv.local`).lastInsertRowid));
      for (let i = 1; i < each; i++) insert.run(`proc${w}-${i}@adv.local`);
    }
    const run = promisify(execFile);
    const script = path.resolve(import.meta.dirname, 'race-worker.js');
    const dbFile = path.join(t.dataDir, 'app.db');
    const startAt = Date.now() + 1500;
    const outputs = await Promise.all(firstUsers.map((first) =>
      run(process.execPath, [script, dbFile, String(slotId), String(first), String(each), String(startAt)])));
    const wins = outputs.map((o) => Number(o.stdout.trim()));
    assert.equal(wins.reduce((a, b) => a + b, 0), stock, `places given out per program: ${wins.join(', ')}`);
    assert.equal(t.db.prepare('SELECT remaining FROM t_slots WHERE id = ?').get(slotId).remaining, 0);
    assert.equal(t.db.prepare('SELECT COUNT(*) AS n FROM t_claims WHERE slot_id = ?').get(slotId).n, stock);
  });

  test('core A05 a claim that fails half-way gives the seat back', async () => {
    const slotId = Number(t.db.prepare("INSERT INTO t_slots (name, remaining) VALUES ('Two seats', 2)").run().lastInsertRowid);
    assert.equal((await ann.post(`/api/_t/slots/${slotId}/claim`, {})).status, 201);
    // The same person again breaks the one-claim-each rule after the seat was taken inside the transaction.
    const again = await ann.post(`/api/_t/slots/${slotId}/claim`, {});
    assert.equal(again.status, 500);
    assert.equal(t.db.prepare('SELECT remaining FROM t_slots WHERE id = ?').get(slotId).remaining, 1, 'the seat taken in the failed attempt was returned');
    assert.equal(t.db.prepare('SELECT COUNT(*) AS n FROM t_claims WHERE slot_id = ?').get(slotId).n, 1);
    // The database itself refuses a negative count, whatever the code does.
    assert.throws(() => t.db.prepare('UPDATE t_slots SET remaining = -1 WHERE id = ?').run(slotId), /CHECK/);
  });

  // ---------------------------------------------------------------- A06 external API and fault tolerance

  describe('with a misbehaving outside service', () => {
    let fake;
    let base;
    let hits = {};
    before(async () => {
      fake = http.createServer((req, res) => {
        hits[req.url] = (hits[req.url] || 0) + 1;
        if (req.url === '/ok') return res.end(JSON.stringify({ rates: { USD: 1.08 } }));
        if (req.url === '/slow') return void setTimeout(() => res.end(JSON.stringify({ rates: { USD: 1 } })), 1500);
        if (req.url === '/garbage') return res.end('<html>502 Bad Gateway</html>');
        if (req.url === '/wrong-shape') return res.end(JSON.stringify({ rates: { USD: 'n/a' } }));
        if (req.url === '/flaky') { res.statusCode = hits[req.url] < 3 ? 503 : 200; return res.end(JSON.stringify({ rates: { USD: 1.1 } })); }
        if (req.url === '/huge') return res.end(JSON.stringify({ pad: 'x'.repeat(50_000) }));
        res.statusCode = 500; return res.end('{}');
      });
      await new Promise((resolve) => fake.listen(0, '127.0.0.1', resolve));
      base = `http://127.0.0.1:${fake.address().port}`;
    });
    after(() => { fake.closeAllConnections(); fake.close(); });

    const validate = (data) => { if (typeof data?.rates?.USD !== 'number') throw new Error('no USD rate'); return data.rates.USD; };
    const quick = { validate, timeoutMs: 200, backoffMs: 5 };

    test('core A06 a good answer is used', async () => {
      resetBreakers();
      assert.deepEqual(await callExternal('rates-ok', `${base}/ok`, quick), { ok: true, value: 1.08, source: 'live' });
    });

    test('core A06 a time-out does not hang or crash the app, and the last good value is used instead', async () => {
      resetBreakers();
      const started = Date.now();
      const result = await callExternal('rates-slow', `${base}/slow`, { ...quick, retries: 1, fallback: () => 1.05 });
      assert.equal(result.ok, false);
      assert.equal(result.error.kind, 'timeout');
      assert.deepEqual([result.value, result.source], [1.05, 'fallback']);
      assert.ok(Date.now() - started < 1200, 'gave up after the time limit instead of waiting for the service');
      assert.equal(hits['/slow'], 2, 'tried once more, then stopped');
    });

    test('core A06 an unreadable answer and an answer with the wrong content are both caught, not passed on', async () => {
      resetBreakers();
      const garbage = await callExternal('rates-garbage', `${base}/garbage`, quick);
      assert.deepEqual([garbage.ok, garbage.error.kind, garbage.value, garbage.source], [false, 'malformed', null, 'none']);
      const wrong = await callExternal('rates-wrong', `${base}/wrong-shape`, { ...quick, fallback: () => 1.05 });
      assert.deepEqual([wrong.ok, wrong.error.kind, wrong.value], [false, 'invalid', 1.05]);
      assert.equal(hits['/garbage'], 1, 'a wrong answer is not asked for again');
      const huge = await callExternal('rates-huge', `${base}/huge`, { ...quick, maxBytes: 1000 });
      assert.equal(huge.error.kind, 'too_large');
      const dead = await callExternal('rates-dead', 'http://127.0.0.1:1/none', { ...quick, retries: 0 });
      assert.equal(dead.error.kind, 'network');
    });

    test('core A06 a service that fails twice and then recovers is retried and used', async () => {
      resetBreakers();
      const result = await callExternal('rates-flaky', `${base}/flaky`, quick);
      assert.deepEqual(result, { ok: true, value: 1.1, source: 'live' });
      assert.equal(hits['/flaky'], 3);
    });

    test('core A06 after repeated failures the app stops asking for a while instead of making everyone wait', async () => {
      resetBreakers();
      const opts = { ...quick, retries: 0, breakerThreshold: 3, breakerCooldownMs: 60_000 };
      for (let i = 0; i < 3; i++) await callExternal('rates-down', `${base}/garbage`, opts);
      const seen = hits['/garbage'];
      const blocked = await callExternal('rates-down', `${base}/garbage`, opts);
      assert.equal(blocked.error.kind, 'open');
      assert.equal(hits['/garbage'], seen, 'no request was made');
    });
  });

  // ---------------------------------------------------------------- A07 multi-step workflow

  const freshLedger = () => {
    t.db.exec('CREATE TABLE IF NOT EXISTS t_ledger (id INTEGER PRIMARY KEY, what TEXT NOT NULL UNIQUE)');
    t.db.exec('DELETE FROM t_ledger');
    return {
      add: (what) => t.db.prepare('INSERT INTO t_ledger (what) VALUES (?) ON CONFLICT (what) DO NOTHING').run(what),
      remove: (what) => t.db.prepare('DELETE FROM t_ledger WHERE what = ?').run(what),
      all: () => t.db.prepare('SELECT what FROM t_ledger ORDER BY id').all().map((r) => r.what),
    };
  };

  test('core A07 the middle step fails after the first succeeded: the first is undone and the job ends in a clear state', async () => {
    const ledger = freshLedger();
    const order = defineWorkflow('order', [
      { name: 'reserve', run: () => { ledger.add('reserved'); return { hold: 7 }; }, undo: (ctx, out) => { assert.equal(out.hold, 7); ledger.remove('reserved'); } },
      { name: 'charge', run: () => { throw new Error('card declined'); }, undo: () => ledger.remove('charged') },
      { name: 'confirm', run: () => { ledger.add('confirmed'); } },
    ]);
    const run = await runWorkflow(t.db, order, { orderId: 1 });
    assert.equal(run.status, 'compensated');
    assert.match(run.error, /charge: card declined/);
    assert.deepEqual(run.steps.map((s) => [s.name, s.status]), [['reserve', 'undone'], ['charge', 'failed'], ['confirm', 'pending']]);
    assert.deepEqual(ledger.all(), [], 'nothing is left half done');
  });

  test('core A07 a passing fault is retried, and a finished job is not started twice', async () => {
    const ledger = freshLedger();
    let tries = 0;
    const flow = defineWorkflow('flaky-job', [
      { name: 'first', run: () => { ledger.add('first'); } },
      { name: 'second', retries: 2, backoffMs: 1, run: () => { if (++tries < 3) throw new Error('busy'); ledger.add('second'); return { tries }; } },
    ]);
    const run = await runWorkflow(t.db, flow, {}, { runKey: 'job-42' });
    assert.equal(run.status, 'completed');
    assert.equal(run.steps[1].attempts, 3);
    const again = await runWorkflow(t.db, flow, {}, { runKey: 'job-42' });
    assert.equal(again.id, run.id);
    assert.equal(tries, 3, 'the steps did not run a second time');
    assert.deepEqual(ledger.all(), ['first', 'second']);
  });

  test('core A07 when an undo itself fails, the job is flagged for a person instead of pretending all is well', async () => {
    const ledger = freshLedger();
    const flow = defineWorkflow('bad-undo', [
      { name: 'pay', run: () => { ledger.add('paid'); }, undo: () => { throw new Error('refund service down'); } },
      { name: 'ship', run: () => { throw new Error('out of stock'); } },
    ]);
    const run = await runWorkflow(t.db, flow, {});
    assert.equal(run.status, 'needs_attention');
    assert.deepEqual(run.steps.map((s) => s.status), ['undo_failed', 'failed']);
    assert.match(run.steps[0].error, /refund service down/);
  });

  test('core A07 a job cut off by a restart is picked up where it stopped, without repeating what was done', async () => {
    const ledger = freshLedger();
    let crash = true;
    const counts = { one: 0, two: 0, three: 0 };
    const flow = defineWorkflow('interrupted', [
      { name: 'one', run: () => { counts.one++; ledger.add('one'); } },
      { name: 'two', run: () => { counts.two++; if (crash) throw Object.assign(new Error('power cut'), { crash: true }); ledger.add('two'); } },
      { name: 'three', run: () => { counts.three++; ledger.add('three'); } },
    ]);
    // Pretend the app died in the middle of step two: the run is left "running" with step one done.
    const id = Number(t.db.prepare("INSERT INTO workflow_runs (name, status, input, created_at, updated_at) VALUES ('interrupted', 'running', 'null', 'now', 'now')").run().lastInsertRowid);
    tx(t.db, () => {
      t.db.prepare("INSERT INTO workflow_steps (run_id, idx, name, status, output) VALUES (?, 0, 'one', 'done', 'null')").run(id);
      t.db.prepare("INSERT INTO workflow_steps (run_id, idx, name, status) VALUES (?, 1, 'two', 'running')").run(id);
      t.db.prepare("INSERT INTO workflow_steps (run_id, idx, name, status) VALUES (?, 2, 'three', 'pending')").run(id);
    });
    ledger.add('one');
    crash = false;
    const recovered = await recoverWorkflows(t.db, [flow]);
    assert.equal(recovered.length, 1);
    assert.equal(describeRun(t.db, id).status, 'completed');
    assert.deepEqual(counts, { one: 0, two: 1, three: 1 });
    assert.deepEqual(ledger.all(), ['one', 'two', 'three']);
  });

  // ---------------------------------------------------------------- A08 data processing and analytics

  test('core A08 a messy file is imported with a report: duplicates, empty cells and bad values are counted, not swallowed', () => {
    t.db.exec('CREATE TABLE IF NOT EXISTS t_sales (email TEXT PRIMARY KEY, amount REAL NOT NULL, city TEXT NOT NULL)');
    t.db.exec('DELETE FROM t_sales');
    const insert = t.db.prepare('INSERT INTO t_sales (email, amount, city) VALUES (?, ?, ?) ON CONFLICT (email) DO NOTHING');
    const file = [
      '﻿Email,Amount,City',
      'ann@x.org,10.50,Leeds',
      '"ben@x.org","1,200.00","York, North"',
      'ANN@X.ORG,99,Leeds',               // the same person again, different capitals
      'cy@x.org,,Hull',                   // amount missing
      'dee@x.org,abc,Hull',               // amount is not a number
      'eve@x.org,7,',                     // city missing: allowed, filled in
      '',
      'fay@x.org,"3","Line one',
      'line two"',                        // a line break inside a quoted cell
    ].join('\r\n');
    const report = importCsv(file, {
      required: ['email', 'amount'],
      missing: { city: 'unknown' },
      keyOf: (r) => r.email,
      clean: (r) => {
        const amount = Number(String(r.amount).replace(/,/g, ''));
        if (!Number.isFinite(amount)) throw new Error(`amount "${r.amount}" is not a number`);
        return { email: r.email.toLowerCase(), amount, city: r.city };
      },
      save: (batch) => tx(t.db, () => { for (const r of batch) insert.run(r.email, r.amount, r.city); }),
    });
    assert.deepEqual({ ...report, problems: report.problems.length }, { total: 7, imported: 4, duplicates: 1, incomplete: 1, invalid: 1, filled: 1, problems: 3 });
    assert.deepEqual(report.problems.map((p) => p.line), [4, 5, 6]);
    const rows = t.db.prepare('SELECT * FROM t_sales ORDER BY email').all().map((r) => ({ ...r }));
    assert.deepEqual(rows, [
      { email: 'ann@x.org', amount: 10.5, city: 'Leeds' },
      { email: 'ben@x.org', amount: 1200, city: 'York, North' },
      { email: 'eve@x.org', amount: 7, city: 'unknown' },
      { email: 'fay@x.org', amount: 3, city: 'Line one\r\nline two' },
    ]);
    assert.throws(() => importCsv('name,total\nx,1', { required: ['email'], save() {} }), /no column named: email/);
    assert.throws(() => importCsv('', { save() {} }), /empty/);
  });

  test('core A08 a hundred thousand rows are imported in batches and summarised by the database', () => {
    t.db.exec('CREATE TABLE IF NOT EXISTS t_readings (sensor TEXT NOT NULL, day TEXT NOT NULL, value REAL, PRIMARY KEY (sensor, day))');
    t.db.exec('DELETE FROM t_readings');
    const insert = t.db.prepare('INSERT INTO t_readings (sensor, day, value) VALUES (?, ?, ?) ON CONFLICT (sensor, day) DO NOTHING');
    const lines = ['sensor,day,value'];
    for (let i = 0; i < 100_000; i++) {
      const sensor = `s${i % 50}`;
      const day = `d${Math.floor(i / 50) % 1800}`;          // repeats after 90,000 rows: 10,000 duplicates
      lines.push(`${sensor},${day},${i % 7 === 0 ? '' : (i % 100)}`);   // every seventh value is missing
    }
    let batches = 0;
    const started = Date.now();
    const report = importCsv(lines.join('\n'), {
      required: ['sensor', 'day'],
      keyOf: (r) => `${r.sensor}|${r.day}`,
      clean: (r) => ({ sensor: r.sensor, day: r.day, value: r.value === '' ? null : Number(r.value) }),
      save: (batch) => { batches++; tx(t.db, () => { for (const r of batch) insert.run(r.sensor, r.day, r.value); }); },
      batchSize: 1000,
    });
    const elapsed = Date.now() - started;
    assert.deepEqual([report.total, report.imported, report.duplicates], [100_000, 90_000, 10_000]);
    assert.equal(batches, 90);
    assert.equal(report.problems.length, 50, 'the report keeps a sample, not ten thousand lines');
    assert.ok(elapsed < 15_000, `took ${elapsed} ms`);

    // Missing values are counted as missing. They are not zeros and do not drag the average down.
    const sql = t.db.prepare('SELECT COUNT(*) AS n, COUNT(value) AS present, AVG(value) AS mean, MIN(value) AS min, MAX(value) AS max FROM t_readings').get();
    const values = t.db.prepare('SELECT value FROM t_readings').all().map((r) => r.value);
    const mine = stats.summarize(values);
    assert.equal(sql.n, 90_000);
    assert.equal(mine.count, sql.present);
    assert.equal(mine.missing, sql.n - sql.present);
    assert.ok(mine.missing > 12_000);
    assert.ok(Math.abs(mine.mean - sql.mean) < 1e-9);
    assert.deepEqual([mine.min, mine.max], [sql.min, sql.max]);
    assert.deepEqual(stats.summarize([null, '', undefined]), { count: 0, missing: 3, sum: 0, mean: null, min: null, max: null, median: null });
    assert.equal(stats.summarize([1, null, 3, 10]).median, 3);
  });

  test('core A08 the reader copes with quotes, commas and line ends of every kind', () => {
    assert.deepEqual([...parseCsv('a,b\n1,2\n')], [['a', 'b'], ['1', '2']]);
    assert.deepEqual([...parseCsv('a,b\r\n"x ""quoted"" y",\r\n,z')], [['a', 'b'], ['x "quoted" y', ''], ['', 'z']]);
    assert.deepEqual([...parseCsv('a;b\n1;2', { delimiter: ';' })], [['a', 'b'], ['1', '2']]);
    assert.deepEqual([...parseCsv('')], []);
  });
});

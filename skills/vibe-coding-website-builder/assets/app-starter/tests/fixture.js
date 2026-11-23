// A tiny pretend module, used only by the core tests, so that the helpers in
// core/ are tested through real routes. Your app's modules get their own
// tests next to this file; you can delete nothing here.

import { tx, now } from '../core/db.js';
import { conflict } from '../core/errors.js';
import { once } from '../core/idempotency.js';
import { guardRecord } from '../core/policy.js';
import { listQuery, takeOne, updateVersioned } from '../core/records.js';
import { check, idParam } from '../core/validate.js';

// The core tests always run with these roles, whatever the app's own are, so
// renaming roles in config.js does not break them.
export const CORE = { roles: ['admin', 'member'], defaultRole: 'member', allowSignup: true };

const THING = {
  title: { type: 'string', required: true, maxLength: 80, label: 'Title' },
  notes: { type: 'text', label: 'Notes' },
  status: { type: 'enum', values: ['open', 'done'], default: 'open', label: 'Status' },
  price: { type: 'number', min: 0, default: 0, label: 'Price' },
};
const rules = {
  entity: 'thing',
  // An administrator sees everything. Others see their own things, and shared ones read-only.
  read: (u, r) => u.role === 'admin' || r.owner_id === u.id || r.shared === 1,
  write: (u, r) => u.role === 'admin' || r.owner_id === u.id,
};

export function setupFixture({ app, db, auth, hub }) {
  db.exec(`
    CREATE TABLE t_things (
      id INTEGER PRIMARY KEY,
      owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL, notes TEXT, status TEXT NOT NULL DEFAULT 'open',
      price REAL NOT NULL DEFAULT 0, shared INTEGER NOT NULL DEFAULT 0,
      version INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT
    );
    CREATE TABLE t_slots (id INTEGER PRIMARY KEY, name TEXT NOT NULL, remaining INTEGER NOT NULL CHECK (remaining >= 0));
    CREATE TABLE t_claims (
      id INTEGER PRIMARY KEY,
      slot_id INTEGER NOT NULL REFERENCES t_slots(id),
      user_id INTEGER NOT NULL REFERENCES users(id),
      UNIQUE (slot_id, user_id)
    );
  `);

  app.get('/api/_t/things', auth.requireUser, (ctx) => {
    const where = ctx.user.role === 'admin' ? [] : [{ sql: 'owner_id = ? OR shared = 1', params: [ctx.user.id] }];
    const list = listQuery(db, {
      table: 't_things', where, query: ctx.query,
      search: { q: ctx.query.q, columns: ['title', 'notes'] },
      filters: { status: 'eq', min_price: { column: 'price', op: '>=' } },
      sortable: ['title', 'price', 'created_at'], defaultSort: '-created_at',
      sums: { priceTotal: 'price' },
    });
    return { ...list, priceTotal: list.sums.priceTotal };
  });

  app.post('/api/_t/things', auth.requireUser, (ctx) => once(ctx, async () => {
    const input = check(await ctx.body(), THING);
    const info = db.prepare('INSERT INTO t_things (owner_id, title, notes, status, price, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(ctx.user.id, input.title, input.notes ?? null, input.status, input.price, now());
    ctx.status(201);
    return { id: Number(info.lastInsertRowid) };
  }));

  app.get('/api/_t/things/:id', auth.requireUser, (ctx) => {
    const thing = db.prepare('SELECT * FROM t_things WHERE id = ?').get(idParam(ctx.params.id));
    return { thing: guardRecord(ctx, thing, rules, 'read') };
  });

  app.patch('/api/_t/things/:id', auth.requireUser, async (ctx) => {
    const id = idParam(ctx.params.id);
    const body = await ctx.body();
    const { version, ...rest } = body;
    const input = check(rest, THING, { partial: true });
    guardRecord(ctx, db.prepare('SELECT * FROM t_things WHERE id = ?').get(id), rules, 'write');
    const thing = updateVersioned(db, 't_things', id, version, input, ['title', 'notes', 'status', 'price']);
    hub.publish('thing.changed', { id, version: thing.version }, { audience: (u) => rules.read(u, thing) });
    return { thing };
  });

  app.delete('/api/_t/things/:id', auth.requireUser, (ctx) => {
    const id = idParam(ctx.params.id);
    guardRecord(ctx, db.prepare('SELECT * FROM t_things WHERE id = ?').get(id), rules, 'write');
    db.prepare('DELETE FROM t_things WHERE id = ?').run(id);
  });

  // Taking one of a limited number.
  app.post('/api/_t/slots/:id/claim', auth.requireUser, async (ctx) => {
    const id = idParam(ctx.params.id);
    await ctx.body();                                   // the request yields here, like a real one
    const claimId = tx(db, () => {
      if (!takeOne(db, 't_slots', id)) throw conflict('Sorry, the last one has just been taken.');
      return Number(db.prepare('INSERT INTO t_claims (slot_id, user_id) VALUES (?, ?)').run(id, ctx.user.id).lastInsertRowid);
    });
    ctx.status(201);
    return { claimId };
  });

  app.get('/api/_t/admin-only', auth.requireRole('admin'), () => ({ ok: true }));
  app.get('/api/_t/boom', () => { throw new Error('secret internal detail'); });
}

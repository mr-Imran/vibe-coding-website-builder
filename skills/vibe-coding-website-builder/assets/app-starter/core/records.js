// Helpers for the three places where data bugs usually hide:
// lists (search, filter, sort), edits by two people at once, and taking the
// last one of something.

import { ident, now } from './db.js';
import { conflict, invalid, notFound } from './errors.js';
import { check } from './validate.js';

// A list with search, filters, sorting and pages, built from request input
// without ever putting that input into the SQL text.
//
//   listQuery(db, {
//     table: 'bookings',
//     where: [{ sql: 'owner_id = ?', params: [ctx.user.id] }],   // written by you, not by the user
//     search: { q: ctx.query.q, columns: ['title', 'notes'] },
//     filters: {
//       status: { check: { type: 'enum', values: ['booked', 'cancelled'] } },   // checked like a form field: a wrong value is a 422
//       from:   { column: 'day', op: '>=', check: { type: 'date' } },
//       day:    { check: { type: 'date' }, where: (day) => ({ sql: 'starts_at >= ? AND starts_at < ?', params: dayRange(day) }) },
//       room:   'eq',                                             // the short form: compared as text, not checked
//     },
//     sortable: ['day', 'title', 'created_at'],
//     sorts: { timetable: ['day', 'starts_at', 'room'] },        // a named order over several columns: ?sort=timetable
//     defaultSort: '-created_at',
//     query: ctx.query,                                          // q, sort, page, page_size, and filter values
//     sums: {                                                    // figures over everything that matches, not just this page
//       spent: 'price_cents',                                    //   a column, added up
//       open:  { count: 'remaining > 0 AND active = 1' },        //   how many rows meet a condition you wrote
//       owed:  { sql: 'price_cents - paid_cents' },              //   an expression you wrote, added up
//     },
//   })
//   -> { rows, total, page, pageSize, pages, sums: { spent, open, owed } }
//
// A filter is one value from the address (?status=booked). Give it a check
// (the same rules as check() in validate.js) unless any text is acceptable.
// A filter whose meaning is worked out (a local day turned into a range of
// stored moments, "upcoming" turned into "after now") takes a where function:
// it gets the checked value and returns { sql, params }, or null for "no
// condition". A condition that does not come from the address at all (only
// this user's rows) goes in where, above.
// The text in where, count and sql is written by you, never by the person:
// put their values in params.
//
// table may be a view. For a list that needs columns from two tables (a
// booking with its class title), create a view in a migration and list that:
//   CREATE VIEW booking_list AS SELECT b.id, b.member_id, b.status, c.title, c.starts_at FROM bookings b JOIN classes c ON c.id = b.class_id;
//
// Rows that are equal in the chosen order are then ordered by tiebreak, so
// pages never shuffle between two requests. It is the id column unless you
// say otherwise, which means a view must have a column called id (as the one
// above does), or you pass tiebreak: 'another_unique_column'.
export function listQuery(db, { table, columns = ['*'], where = [], search = null, filters = {}, sortable = [], sorts = {}, defaultSort = '-id', tiebreak = 'id', query = {}, sums = {} }) {
  const clauses = [];
  const params = [];
  for (const w of where) { clauses.push(`(${w.sql})`); params.push(...(w.params || [])); }

  if (search && search.q) {
    const term = `%${String(search.q).slice(0, 100).replace(/[\\%_]/g, '\\$&')}%`;
    clauses.push(`(${search.columns.map((c) => `${ident(c)} LIKE ? ESCAPE '\\'`).join(' OR ')})`);
    for (let i = 0; i < search.columns.length; i++) params.push(term);
  }
  for (const [name, rule] of Object.entries(filters)) {
    let value = query[name];
    if (value === undefined || value === '') continue;
    const spec = typeof rule === 'string' ? { op: rule === 'eq' ? '=' : rule } : rule;
    // A filter with a check is validated like a form field: ?status=maybe is
    // answered 422 with the reason, not with a list that is quietly empty.
    if (spec.check) value = check({ [name]: value }, { [name]: { label: name, ...spec.check } })[name];
    if (typeof spec.where === 'function') {
      const made = spec.where(value);
      if (made) { clauses.push(`(${made.sql})`); params.push(...(made.params || [])); }
      continue;
    }
    const op = spec.op || '=';
    if (!['=', '<>', '>', '>=', '<', '<='].includes(op)) throw new Error(`listQuery: unsupported operator ${op}`);
    clauses.push(`${ident(spec.column || name)} ${op} ?`);
    params.push(value);
  }

  let sort = String(query.sort || defaultSort);
  let dir = 'ASC';
  if (sort.startsWith('-')) { dir = 'DESC'; sort = sort.slice(1); }
  const known = (name) => sortable.includes(name) || Object.hasOwn(sorts, name) || name === tiebreak;
  if (!known(sort)) { sort = defaultSort.replace(/^-/, ''); dir = defaultSort.startsWith('-') ? 'DESC' : 'ASC'; }
  const orderColumns = Object.hasOwn(sorts, sort) ? [...sorts[sort]] : [sort];
  if (tiebreak && !orderColumns.includes(tiebreak)) orderColumns.push(tiebreak);
  const orderSql = orderColumns.map((c) => `${ident(c)} ${dir}`).join(', ');

  const pageSize = Math.min(100, Math.max(1, Number.parseInt(query.page_size, 10) || 20));
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const whereSql = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const cols = columns.map((c) => (c === '*' ? '*' : ident(c))).join(', ');
  const total = db.prepare(`SELECT COUNT(*) AS n FROM ${ident(table)} ${whereSql}`).get(...params).n;
  const rows = db.prepare(`SELECT ${cols} FROM ${ident(table)} ${whereSql} ORDER BY ${orderSql} LIMIT ? OFFSET ?`)
    .all(...params, pageSize, (page - 1) * pageSize);
  const totals = {};
  const sumNames = Object.keys(sums);
  if (sumNames.length) {
    const sumParams = [];
    const exprs = sumNames.map((name) => {
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw new Error(`listQuery: unsafe name for a total: ${name}`);
      const spec = sums[name];
      let inner;
      if (typeof spec === 'string') inner = ident(spec);
      else if (spec && typeof spec.count === 'string') inner = `CASE WHEN (${spec.count}) THEN 1 ELSE 0 END`;
      else if (spec && typeof spec.sql === 'string') inner = `(${spec.sql})`;
      else throw new Error(`listQuery: the total "${name}" must be a column name, { count: 'condition' } or { sql: 'expression' }`);
      if (typeof spec !== 'string') sumParams.push(...(spec.params || []));
      return `COALESCE(SUM(${inner}), 0) AS "${name}"`;
    }).join(', ');
    Object.assign(totals, db.prepare(`SELECT ${exprs} FROM ${ident(table)} ${whereSql}`).get(...sumParams, ...params));
  }
  return { rows, total, page, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)), sums: totals };
}

// Save an edit only if nobody else saved first.
//
// The table needs: version INTEGER NOT NULL DEFAULT 1, updated_at TEXT.
// The page sends back the version it loaded. If the row has moved on, the
// second person gets a 409 with the current record, and the screen can show
// both versions and let them choose. Nothing is overwritten silently.
//
// A request that leaves the version out, or sends something that is not a
// whole number, is answered 422 (the field is "version"), never with "someone
// else changed this": that would be untrue, and would send the person looking
// for a colleague who did nothing.
//
// The row is found by its id column. For a table keyed by something else (a
// profile keyed by user_id), say so: { key: 'user_id' }.
export function updateVersioned(db, table, id, expectedVersion, changes, allowedColumns, { key = 'id' } = {}) {
  const v = expectedVersion;
  const whole = (typeof v === 'number' && Number.isInteger(v) && v >= 1) || (typeof v === 'string' && /^[1-9][0-9]*$/.test(v.trim()));
  if (!whole) {
    throw invalid({ version: 'The version of the record being edited is missing or is not a whole number.' },
      'This change did not say which version of the record it started from. Reload the page and try again.');
  }
  const keys = Object.keys(changes).filter((k) => allowedColumns.includes(k));
  const sets = keys.map((k) => `${ident(k)} = ?`);
  const info = db.prepare(`UPDATE ${ident(table)} SET ${[...sets, 'version = version + 1', 'updated_at = ?'].join(', ')} WHERE ${ident(key)} = ? AND version = ?`)
    .run(...keys.map((k) => changes[k]), now(), id, Number(v));
  const current = db.prepare(`SELECT * FROM ${ident(table)} WHERE ${ident(key)} = ?`).get(id);
  if (!current) throw notFound();
  if (info.changes === 0) {
    throw conflict('Someone else changed this while you were editing. Nothing was overwritten.', { current });
  }
  return current;
}

// Take one of a limited thing (a seat, a slot, a unit of stock).
//
// One statement that only succeeds while something is left. Whatever the
// number of people asking at the same moment, the count cannot go below zero
// and nobody is told "yours" for something that was already gone.
// Call it inside tx() together with the insert that records who got it.
// Returns true when one was taken. { key: 'slot_id' } for a table whose rows
// are not found by id.
export function takeOne(db, table, id, column = 'remaining', amount = 1, { key = 'id' } = {}) {
  const info = db.prepare(`UPDATE ${ident(table)} SET ${ident(column)} = ${ident(column)} - ? WHERE ${ident(key)} = ? AND ${ident(column)} >= ?`)
    .run(amount, id, amount);
  return info.changes === 1;
}

// The mirror image, for a cancellation: put one back. Call it inside the
// same tx() that marks the booking as cancelled, and only when that update
// really changed a row, so that cancelling twice does not free two places:
//
//   tx(db, () => {
//     const done = db.prepare("UPDATE bookings SET status = 'cancelled' WHERE id = ? AND status = 'booked'").run(id);
//     if (done.changes === 1) giveBack(db, 'classes', booking.class_id);
//   });
//
// Returns true when a row was changed.
export function giveBack(db, table, id, column = 'remaining', amount = 1, { key = 'id' } = {}) {
  const info = db.prepare(`UPDATE ${ident(table)} SET ${ident(column)} = ${ident(column)} + ? WHERE ${ident(key)} = ?`).run(amount, id);
  return info.changes === 1;
}

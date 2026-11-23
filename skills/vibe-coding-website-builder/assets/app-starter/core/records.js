// Helpers for the three places where data bugs usually hide:
// lists (search, filter, sort), edits by two people at once, and taking the
// last one of something.

import { ident, now } from './db.js';
import { conflict, notFound } from './errors.js';

// A list with search, filters, sorting and pages, built from request input
// without ever putting that input into the SQL text.
//
//   listQuery(db, {
//     table: 'bookings',
//     where: [{ sql: 'owner_id = ?', params: [ctx.user.id] }],   // written by you, not by the user
//     search: { q: ctx.query.q, columns: ['title', 'notes'] },
//     filters: { status: 'eq', from: { column: 'day', op: '>=' } },
//     sortable: ['day', 'title', 'created_at'],
//     sorts: { timetable: ['day', 'starts_at', 'room'] },        // a named order over several columns: ?sort=timetable
//     defaultSort: '-created_at',
//     query: ctx.query,                                          // q, sort, page, page_size, and filter values
//     sums: { spent: 'price_cents' },                            // totals over everything that matches, not just this page
//   })
//   -> { rows, total, page, pageSize, pages, sums: { spent } }
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
    const value = query[name];
    if (value === undefined || value === '') continue;
    const spec = typeof rule === 'string' ? { column: name, op: rule === 'eq' ? '=' : rule } : rule;
    if (!['=', '<>', '>', '>=', '<', '<='].includes(spec.op)) throw new Error(`listQuery: unsupported operator ${spec.op}`);
    clauses.push(`${ident(spec.column)} ${spec.op} ?`);
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
    for (const name of sumNames) if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw new Error(`listQuery: unsafe name for a total: ${name}`);
    const exprs = sumNames.map((name) => `COALESCE(SUM(${ident(sums[name])}), 0) AS "${name}"`).join(', ');
    Object.assign(totals, db.prepare(`SELECT ${exprs} FROM ${ident(table)} ${whereSql}`).get(...params));
  }
  return { rows, total, page, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)), sums: totals };
}

// Save an edit only if nobody else saved first.
//
// The table needs: version INTEGER NOT NULL DEFAULT 1, updated_at TEXT.
// The page sends back the version it loaded. If the row has moved on, the
// second person gets a 409 with the current record, and the screen can show
// both versions and let them choose. Nothing is overwritten silently.
export function updateVersioned(db, table, id, expectedVersion, changes, allowedColumns) {
  const keys = Object.keys(changes).filter((k) => allowedColumns.includes(k));
  const sets = keys.map((k) => `${ident(k)} = ?`);
  const info = db.prepare(`UPDATE ${ident(table)} SET ${[...sets, 'version = version + 1', 'updated_at = ?'].join(', ')} WHERE id = ? AND version = ?`)
    .run(...keys.map((k) => changes[k]), now(), id, Number(expectedVersion));
  const current = db.prepare(`SELECT * FROM ${ident(table)} WHERE id = ?`).get(id);
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
export function takeOne(db, table, id, column = 'remaining', amount = 1) {
  const info = db.prepare(`UPDATE ${ident(table)} SET ${ident(column)} = ${ident(column)} - ? WHERE id = ? AND ${ident(column)} >= ?`)
    .run(amount, id, amount);
  return info.changes === 1;
}

export function giveBack(db, table, id, column = 'remaining', amount = 1) {
  db.prepare(`UPDATE ${ident(table)} SET ${ident(column)} = ${ident(column)} + ? WHERE id = ?`).run(amount, id);
}

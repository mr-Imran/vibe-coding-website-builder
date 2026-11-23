// The database: one SQLite file, opened with Node's built-in driver.
// No packages to install. Everything is synchronous, which is what makes the
// transaction helper below safe.

import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export function openDb(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL');      // readers do not block the writer
  db.exec('PRAGMA foreign_keys = ON');       // relationships are enforced, not just declared
  db.exec('PRAGMA busy_timeout = 5000');
  db.exec('PRAGMA synchronous = NORMAL');
  return db;
}

// Run every .sql file in the folder once, in name order (001_..., 002_...).
// Never edit a migration that has been applied; add a new file instead.
export function migrate(db, dir) {
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)');
  const done = new Set(db.prepare('SELECT name FROM schema_migrations').all().map((r) => r.name));
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  const applied = [];
  for (const name of files) {
    if (done.has(name)) continue;
    const sql = fs.readFileSync(path.join(dir, name), 'utf8');
    tx(db, () => {
      db.exec(sql);
      db.prepare('INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)').run(name, now());
    });
    applied.push(name);
  }
  return applied;
}

let depth = 0;
let savepoint = 0;

// All-or-nothing. Either every statement inside fn is saved, or none is.
//
// BEGIN IMMEDIATE takes the write lock at the start, so two requests can never
// both read "1 left" and both take it. fn must not be async: an await in the
// middle would let another request run inside the transaction. The guard below
// turns that mistake into an error instead of a rare, silent double booking.
export function tx(db, fn) {
  if (depth > 0) {
    const name = `sp_${++savepoint}`;
    db.exec(`SAVEPOINT ${name}`);
    try {
      const result = guardSync(fn());
      db.exec(`RELEASE ${name}`);
      return result;
    } catch (err) {
      db.exec(`ROLLBACK TO ${name}`);
      db.exec(`RELEASE ${name}`);
      throw err;
    }
  }
  db.exec('BEGIN IMMEDIATE');
  depth++;
  try {
    const result = guardSync(fn());
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  } finally {
    depth--;
  }
}

function guardSync(result) {
  if (result && typeof result.then === 'function') {
    throw new Error('tx(): the function returned a promise. Do the awaiting before or after the transaction, never inside it.');
  }
  return result;
}

export const now = () => new Date().toISOString();

// Table and column names cannot be passed as ? parameters, so any name that
// goes into SQL text is checked here first.
export function ident(name) {
  if (typeof name !== 'string' || !/^[a-z_][a-z0-9_]*$/.test(name)) {
    throw new Error(`Unsafe SQL name: ${String(name)}`);
  }
  return name;
}

-- Tables the core needs. Your own tables go in 002_..., 003_... files.
-- Never edit a migration after it has run somewhere; add a new one.

CREATE TABLE users (
  id            INTEGER PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL,
  active        INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at    TEXT NOT NULL
);

CREATE TABLE sessions (
  id           INTEGER PRIMARY KEY,
  token_hash   TEXT NOT NULL UNIQUE,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  csrf         TEXT NOT NULL,
  created_at   TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  expires_at   TEXT NOT NULL
);
CREATE INDEX sessions_user ON sessions(user_id);

CREATE TABLE login_attempts (
  key TEXT NOT NULL,
  at  INTEGER NOT NULL
);
CREATE INDEX login_attempts_key ON login_attempts(key, at);

CREATE TABLE audit_log (
  id        INTEGER PRIMARY KEY,
  at        TEXT NOT NULL,
  user_id   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action    TEXT NOT NULL,
  entity    TEXT,
  entity_id TEXT,
  detail    TEXT,
  ip        TEXT
);
CREATE INDEX audit_log_at ON audit_log(at);

CREATE TABLE idempotency_keys (
  key        TEXT NOT NULL,
  scope      TEXT NOT NULL,
  status     INTEGER NOT NULL,
  response   TEXT,
  created_at TEXT NOT NULL,
  PRIMARY KEY (key, scope)
);

CREATE TABLE workflow_runs (
  id         INTEGER PRIMARY KEY,
  name       TEXT NOT NULL,
  run_key    TEXT,
  status     TEXT NOT NULL CHECK (status IN ('running', 'completed', 'compensated', 'needs_attention')),
  input      TEXT,
  error      TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (name, run_key)
);

CREATE TABLE workflow_steps (
  run_id      INTEGER NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
  idx         INTEGER NOT NULL,
  name        TEXT NOT NULL,
  status      TEXT NOT NULL CHECK (status IN ('pending', 'running', 'done', 'failed', 'undone', 'undo_failed', 'kept')),
  attempts    INTEGER NOT NULL DEFAULT 0,
  output      TEXT,
  error       TEXT,
  started_at  TEXT,
  finished_at TEXT,
  PRIMARY KEY (run_id, idx)
);

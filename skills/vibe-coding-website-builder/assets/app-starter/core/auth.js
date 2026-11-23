// Sign-in, sessions and roles.
//
// - Passwords are stored as scrypt hashes, never as text.
// - A session is a random token in a cookie the page's scripts cannot read.
//   The database keeps only a hash of it, so a copy of the database does not
//   contain working sessions.
// - Every request that changes something must also carry the session's CSRF
//   token in a header (checked in http.js), so another website cannot act for
//   a signed-in user.
// - Roles are checked on the server for every route. Hiding a button is not
//   access control.

import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { now, tx } from './db.js';
import { HttpError, forbidden, invalid, notFound, tooMany, unauthorized } from './errors.js';
import { check, idParam } from './validate.js';
import { audit } from './policy.js';
import { listQuery } from './records.js';

const scryptAsync = promisify(scrypt);
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILS_PER_ACCOUNT = 5;
const MAX_FAILS_PER_IP = 20;

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password, stored) {
  const parts = String(stored).split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, N, r, p, salt, hash] = parts;
  const expected = Buffer.from(hash, 'base64');
  const key = await scryptAsync(password, Buffer.from(salt, 'base64'), expected.length, { N: Number(N), r: Number(r), p: Number(p) });
  return key.length === expected.length && timingSafeEqual(key, expected);
}

const sha256 = (text) => createHash('sha256').update(text).digest('hex');
const publicUser = (u) => ({ id: u.id, email: u.email, name: u.name, role: u.role });

const PASSWORD_RULE = { type: 'string', required: true, minLength: 8, maxLength: 200, label: 'Password' };
const SIGNUP = {
  email: { type: 'email', required: true, label: 'Email' },
  name: { type: 'string', required: true, maxLength: 80, label: 'Name' },
  password: PASSWORD_RULE,
};
const LOGIN = {
  email: { type: 'email', required: true, label: 'Email' },
  password: { type: 'string', required: true, maxLength: 200, label: 'Password' },
};

export function createAuth({ db, config }) {
  const cookieName = config.secureCookies ? '__Host-sid' : 'sid';
  let dummyHash = null;

  // Let a module react when an account is created or changed:
  //
  //   auth.on('user.created', (user) => db.prepare('INSERT INTO profiles (user_id) VALUES (?)').run(user.id));
  //   auth.on('user.changed', (user, before) => { if (before.active && !user.active) freeTheirBookings(user.id); });
  //
  // user and before are { id, email, name, role, active }. A listener runs
  // inside the same transaction as the change, so the account and what the
  // listener writes are saved together or not at all: if it throws, the
  // account is not created or changed. It must not be async.
  // 'user.created' fires for every new account: sign-up, the People screen,
  // the first administrator, tools/add-user.js and tools/seed.js.
  const listeners = { 'user.created': [], 'user.changed': [] };
  function on(event, fn) {
    if (!listeners[event]) throw new Error(`auth.on: there is no event "${event}". The events are: ${Object.keys(listeners).join(', ')}.`);
    listeners[event].push(fn);
  }
  function emit(event, ...args) {
    for (const fn of listeners[event]) {
      const result = fn(...args);
      if (result && typeof result.then === 'function') throw new Error(`auth.on('${event}'): the listener is async. It runs inside a transaction and must finish at once.`);
    }
  }
  const snapshot = (u) => ({ id: u.id, email: u.email, name: u.name, role: u.role, active: u.active ? 1 : 0 });

  function cookie(token, maxAgeSeconds) {
    const parts = [`${cookieName}=${token}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAgeSeconds}`];
    if (config.secureCookies) parts.push('Secure');
    return parts.join('; ');
  }

  function readToken(req) {
    for (const part of String(req.headers.cookie || '').split(';')) {
      const [name, ...rest] = part.trim().split('=');
      if (name === cookieName) return rest.join('=');
    }
    return null;
  }

  // Called for every /api request. Returns { user, session } or null.
  function loadSession(req) {
    const token = readToken(req);
    if (!token || token.length > 200) return null;
    const row = db.prepare(`
      SELECT s.id AS sid, s.csrf, s.expires_at, s.last_seen_at,
             u.id, u.email, u.name, u.role, u.active
      FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ?`).get(sha256(token));
    if (!row) return null;
    const nowMs = Date.now();
    const idleLimit = config.sessionIdleHours * 3600_000;
    const expired = Date.parse(row.expires_at) <= nowMs || nowMs - Date.parse(row.last_seen_at) > idleLimit;
    if (expired || !row.active) {
      db.prepare('DELETE FROM sessions WHERE id = ?').run(row.sid);
      return null;
    }
    if (nowMs - Date.parse(row.last_seen_at) > 60_000) {
      db.prepare('UPDATE sessions SET last_seen_at = ? WHERE id = ?').run(now(), row.sid);
    }
    return { user: publicUser(row), session: { id: row.sid, csrf: row.csrf } };
  }

  function startSession(res, userId) {
    const token = randomBytes(32).toString('base64url');
    const csrf = randomBytes(24).toString('base64url');
    const maxAge = config.sessionDays * 86400;
    db.prepare('INSERT INTO sessions (token_hash, user_id, csrf, created_at, last_seen_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(sha256(token), userId, csrf, now(), now(), new Date(Date.now() + maxAge * 1000).toISOString());
    res.setHeader('Set-Cookie', cookie(token, maxAge));
    return csrf;
  }

  async function createUser({ email, name, password, role = config.defaultRole }) {
    if (!config.roles.includes(role)) throw new Error(`Unknown role: ${role}`);
    const hash = await hashPassword(password);
    try {
      return tx(db, () => {
        const info = db.prepare('INSERT INTO users (email, name, password_hash, role, active, created_at) VALUES (?, ?, ?, ?, 1, ?)')
          .run(email.toLowerCase(), name, hash, role, now());
        const id = Number(info.lastInsertRowid);
        emit('user.created', { id, email: email.toLowerCase(), name, role, active: 1 });
        return id;
      });
    } catch (err) {
      if (String(err.message).includes('UNIQUE') && String(err.message).includes('users.email')) throw invalid({ email: 'There is already an account with this email.' });
      throw err;
    }
  }

  function recentFailures(key) {
    return db.prepare('SELECT COUNT(*) AS n FROM login_attempts WHERE key = ? AND at > ?')
      .get(key, Date.now() - LOGIN_WINDOW_MS).n;
  }

  async function login(ctx) {
    const { email, password } = check(await ctx.body(), LOGIN);
    const accountKey = `acct:${email}`;
    const ipKey = `ip:${ctx.ip}`;
    if (recentFailures(accountKey) >= MAX_FAILS_PER_ACCOUNT || recentFailures(ipKey) >= MAX_FAILS_PER_IP) throw tooMany();

    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    // Hash even when the account does not exist, so the answer takes the same
    // time either way and does not reveal which emails have accounts.
    dummyHash ??= await hashPassword(randomBytes(12).toString('hex'));
    const ok = await verifyPassword(password, user ? user.password_hash : dummyHash);
    if (!user || !ok || !user.active) {
      const at = Date.now();
      db.prepare('INSERT INTO login_attempts (key, at) VALUES (?, ?), (?, ?)').run(accountKey, at, ipKey, at);
      db.prepare('DELETE FROM login_attempts WHERE at < ?').run(at - LOGIN_WINDOW_MS);
      audit(db, { userId: user ? user.id : null, action: 'auth.login_failed', detail: email, ip: ctx.ip });
      throw new HttpError(401, 'bad_login', 'The email or password is not right.');
    }
    db.prepare('DELETE FROM login_attempts WHERE key = ?').run(accountKey);
    const csrf = startSession(ctx.res, user.id);
    audit(db, { userId: user.id, action: 'auth.login', ip: ctx.ip });
    return { user: publicUser(user), csrf };
  }

  // Guards: put them before the handler in a route.
  const requireUser = (ctx) => { if (!ctx.user) throw unauthorized(); };
  const requireRole = (...roles) => (ctx) => {
    if (!ctx.user) throw unauthorized();
    if (!roles.includes(ctx.user.role)) {
      audit(db, { userId: ctx.user.id, action: 'auth.denied', detail: `${ctx.req.method} ${ctx.req.url}`, ip: ctx.ip });
      throw forbidden();
    }
  };

  function registerRoutes(app) {
    app.post('/api/auth/signup', { public: true }, async (ctx) => {
      if (!config.allowSignup) throw forbidden('New accounts are created by an administrator.');
      const input = check(await ctx.body(), SIGNUP);
      const id = await createUser(input);                       // always the lowest role
      const csrf = startSession(ctx.res, id);
      audit(db, { userId: id, action: 'auth.signup', ip: ctx.ip });
      ctx.status(201);
      return { user: publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(id)), csrf };
    });

    app.post('/api/auth/login', { public: true }, login);

    app.post('/api/auth/logout', requireUser, (ctx) => {
      db.prepare('DELETE FROM sessions WHERE id = ?').run(ctx.session.id);
      ctx.res.setHeader('Set-Cookie', cookie('', 0));
    });

    // The page asks this on load: who am I, and what is my CSRF token?
    app.get('/api/auth/me', (ctx) => {
      if (!ctx.user) throw unauthorized();
      return { user: ctx.user, csrf: ctx.session.csrf, roles: config.roles };
    });

    app.post('/api/auth/password', requireUser, async (ctx) => {
      const input = check(await ctx.body(), {
        current: { type: 'string', required: true, maxLength: 200, label: 'Current password' },
        next: { ...PASSWORD_RULE, label: 'New password' },
      });
      const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(ctx.user.id);
      if (!(await verifyPassword(input.current, row.password_hash))) throw invalid({ current: 'That is not your current password.' });
      const hash = await hashPassword(input.next);
      tx(db, () => {
        db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, ctx.user.id);
        // Sign out every other device.
        db.prepare('DELETE FROM sessions WHERE user_id = ? AND id <> ?').run(ctx.user.id, ctx.session.id);
      });
      audit(db, { userId: ctx.user.id, action: 'auth.password_changed', ip: ctx.ip });
    });

    // Managing people: the highest role only.
    const admin = requireRole(config.roles[0]);
    app.get('/api/users', admin, (ctx) => {
      const list = listQuery(db, {
        table: 'users', columns: ['id', 'email', 'name', 'role', 'active', 'created_at'], query: ctx.query,
        search: { q: ctx.query.q, columns: ['name', 'email'] },
        filters: {
          role: { check: { type: 'enum', values: config.roles, label: 'Role' } },
          active: { check: { type: 'bool', label: 'Can sign in' } },
        },
        sortable: ['name', 'email', 'role', 'created_at'], defaultSort: 'name',
        sums: { canSignIn: { count: 'active = 1' } },
      });
      return { ...list, users: list.rows };
    });
    app.post('/api/users', admin, async (ctx) => {
      const input = check(await ctx.body(), { ...SIGNUP, role: { type: 'enum', values: config.roles, required: true, label: 'Role' } });
      const id = await createUser(input);
      audit(db, { userId: ctx.user.id, action: 'user.created', entity: 'user', entityId: id, detail: input.role, ip: ctx.ip });
      ctx.status(201);
      return { id };
    });
    // Passwords cannot be looked up, only replaced. This is how someone who
    // is locked out gets back in; it also signs them out everywhere.
    app.post('/api/users/:id/password', admin, async (ctx) => {
      const id = idParam(ctx.params.id);
      const input = check(await ctx.body(), { next: { ...PASSWORD_RULE, label: 'New password' } });
      if (!db.prepare('SELECT id FROM users WHERE id = ?').get(id)) throw notFound();
      const hash = await hashPassword(input.next);
      tx(db, () => {
        db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, id);
        db.prepare('DELETE FROM sessions WHERE user_id = ? AND id <> ?').run(id, ctx.session.id);
      });
      audit(db, { userId: ctx.user.id, action: 'user.password_set', entity: 'user', entityId: id, ip: ctx.ip });
    });

    app.patch('/api/users/:id', admin, async (ctx) => {
      const id = idParam(ctx.params.id);
      const input = check(await ctx.body(), {
        role: { type: 'enum', values: config.roles, label: 'Role' },
        active: { type: 'bool', label: 'Active' },
      }, { partial: true });
      tx(db, () => {
        const target = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
        if (!target) throw notFound();
        const role = input.role ?? target.role;
        const active = input.active ?? target.active;
        // Never leave the app without anyone who can manage it.
        if (target.role === config.roles[0] && target.active && (role !== config.roles[0] || !active)) {
          const others = db.prepare('SELECT COUNT(*) AS n FROM users WHERE role = ? AND active = 1 AND id <> ?').get(config.roles[0], id).n;
          if (others === 0) throw new HttpError(409, 'last_admin', 'This is the only administrator. Make someone else an administrator first.');
        }
        db.prepare('UPDATE users SET role = ?, active = ? WHERE id = ?').run(role, active, id);
        if (!active || role !== target.role) db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
        emit('user.changed', snapshot({ ...target, role, active }), snapshot(target));
      });
      audit(db, { userId: ctx.user.id, action: 'user.changed', entity: 'user', entityId: id, detail: JSON.stringify(input), ip: ctx.ip });
    });
  }

  // First start on a new database: create the administrator from the
  // environment, so nobody can claim the app by being first to sign up.
  async function bootstrapAdmin() {
    const count = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
    if (count > 0 || !config.adminEmail || !config.adminPassword) return false;
    if (config.adminPassword.length < 8) throw new Error('ADMIN_PASSWORD must be at least 8 characters.');
    await createUser({ email: config.adminEmail, name: 'Administrator', password: config.adminPassword, role: config.roles[0] });
    return true;
  }

  return { loadSession, createUser, requireUser, requireRole, registerRoutes, bootstrapAdmin, cookieName, on };
}

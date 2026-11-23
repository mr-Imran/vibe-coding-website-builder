// The same action sent twice happens once.
//
// People double-click. Phones resend when the signal drops. An offline page
// sends its saved-up actions again after a failed attempt. Each action
// carries an Idempotency-Key header (the page helper adds one); the first
// request does the work and its answer is stored, and a repeat with the same
// key gets that stored answer back instead of a second booking or payment.

import { now } from './db.js';
import { HttpError } from './errors.js';

//   app.post('/api/bookings', requireUser, (ctx) => once(ctx, async () => { ...; return { id }; }));
export async function once(ctx, work) {
  const key = String(ctx.req.headers['idempotency-key'] || '');
  if (!key) return work();
  if (key.length > 100) throw new HttpError(400, 'bad_request', 'The request key is too long.');
  const db = ctx.db;
  const scope = `${ctx.user ? ctx.user.id : 'anon'}:${ctx.req.method}:${ctx.req.url.split('?')[0]}`;

  // Claim the key first. The table's unique rule makes a simultaneous second
  // request fail here instead of running the work twice.
  try {
    db.prepare('INSERT INTO idempotency_keys (key, scope, status, created_at) VALUES (?, ?, ?, ?)').run(key, scope, 0, now());
  } catch (err) {
    if (!String(err.message).includes('UNIQUE')) throw err;
    const row = db.prepare('SELECT status, response FROM idempotency_keys WHERE key = ? AND scope = ?').get(key, scope);
    if (!row || row.status === 0) {
      throw new HttpError(409, 'in_progress', 'This is already being processed. Please wait a moment.');
    }
    const stored = JSON.parse(row.response);
    if (row.status >= 400) throw new HttpError(row.status, stored.code, stored.message, stored.extra || {});
    ctx.status(row.status);
    ctx.res.setHeader('Idempotent-Replay', 'true');
    return stored.body;
  }

  try {
    const body = await work();
    const status = ctx.statusCode || (body === undefined || body === null ? 204 : 200);
    db.prepare('UPDATE idempotency_keys SET status = ?, response = ? WHERE key = ? AND scope = ?')
      .run(status, JSON.stringify({ body: body ?? null }), key, scope);
    return body;
  } catch (err) {
    if (err instanceof HttpError && err.status < 500) {
      // A refusal is an answer too: the repeat gets the same refusal.
      db.prepare('UPDATE idempotency_keys SET status = ?, response = ? WHERE key = ? AND scope = ?')
        .run(err.status, JSON.stringify({ code: err.code, message: err.message, extra: err.extra }), key, scope);
    } else {
      // The work crashed. Free the key so that trying again really tries again.
      db.prepare('DELETE FROM idempotency_keys WHERE key = ? AND scope = ?').run(key, scope);
    }
    throw err;
  }
}

// Call now and then (for example at start-up) so the table stays small.
export function forgetOldKeys(db, olderThanDays = 2) {
  const cutoff = new Date(Date.now() - olderThanDays * 86400_000).toISOString();
  return db.prepare('DELETE FROM idempotency_keys WHERE created_at < ?').run(cutoff).changes;
}

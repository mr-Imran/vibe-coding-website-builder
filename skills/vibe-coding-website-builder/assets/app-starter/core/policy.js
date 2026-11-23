// Who may see and change which record, and a log of what happened.
//
// A role says what kind of user someone is. It does not say which records are
// theirs. Every route that takes an id from the address must also check that
// this user may touch that particular record, or anyone can read and change
// other people's data by changing the number in the address.

import { now } from './db.js';
import { forbidden, notFound } from './errors.js';

// One line per thing worth knowing later: sign-ins, refusals, changes.
export function audit(db, { userId = null, action, entity = null, entityId = null, detail = null, ip = null }) {
  db.prepare('INSERT INTO audit_log (at, user_id, action, entity, entity_id, detail, ip) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(now(), userId, action, entity, entityId === null ? null : String(entityId), detail === null ? null : String(detail).slice(0, 500), ip);
}

export const owns = (user, record, field = 'owner_id') => Boolean(user && record && record[field] === user.id);

// Use right after loading a record by id.
//
//   const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(id);
//   guardRecord(ctx, booking, {
//     entity: 'booking',
//     read:  (u, r) => u.role === 'admin' || r.owner_id === u.id,
//     write: (u, r) => u.role === 'admin' || (r.owner_id === u.id && r.status === 'pending'),
//   }, 'write');
//
// A record the user may not see answers "not found", exactly like a record
// that does not exist, so ids cannot be probed. A record they may see but not
// change answers "not allowed". Refusals are written to the audit log.
//
// Call it before tx(), not inside: a refusal throws, the transaction is
// rolled back, and the audit line written a moment earlier would go with it.
export function guardRecord(ctx, record, rules, need = 'read') {
  if (!record) throw notFound();
  const canRead = rules.read(ctx.user, record);
  if (!canRead) {
    audit(ctx.db, { userId: ctx.user?.id, action: 'access.denied', entity: rules.entity, entityId: record.id, detail: `${need} (hidden)`, ip: ctx.ip });
    throw notFound();
  }
  if (need === 'write' && !rules.write(ctx.user, record)) {
    audit(ctx.db, { userId: ctx.user?.id, action: 'access.denied', entity: rules.entity, entityId: record.id, detail: 'write', ip: ctx.ip });
    throw forbidden();
  }
  return record;
}

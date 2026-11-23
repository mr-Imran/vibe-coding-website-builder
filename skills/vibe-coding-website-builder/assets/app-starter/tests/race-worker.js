// One of several separate programs fighting over the same database file.
// Started by the "two programs at once" test in advanced.test.js; not a test
// file itself.
//
//   node tests/race-worker.js DB_FILE SLOT_ID FIRST_USER_ID COUNT START_AT_MS
//
// It waits until START_AT_MS so that all workers begin together, then tries
// to take the slot once for each of COUNT users, and prints how many it got.

import { openDb, tx } from '../core/db.js';
import { takeOne } from '../core/records.js';

const [file, slotId, firstUser, count, startAt] = process.argv.slice(2).map((v, i) => (i === 0 ? v : Number(v)));
const db = openDb(file);
const claim = db.prepare('INSERT INTO t_claims (slot_id, user_id) VALUES (?, ?)');

while (Date.now() < startAt) { /* spin until the shared start time */ }

let won = 0;
for (let i = 0; i < count; i++) {
  try {
    tx(db, () => {
      if (!takeOne(db, 't_slots', slotId)) throw new Error('gone');
      claim.run(slotId, firstUser + i);
    });
    won++;
  } catch (err) {
    if (err.message !== 'gone') { console.error(err.message); process.exitCode = 1; }
  }
}
db.close();
console.log(won);

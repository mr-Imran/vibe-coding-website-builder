// Fill the app with example data for a demonstration: one account for each
// role, plus whatever addExampleData() below creates. On Windows,
// double-clicking load-example-data.cmd runs this.
//
//   node tools/seed.js
//
// The careful parts are already written, and stay as they are:
// - passwords are made up when this runs and shown once, never kept in a file;
// - it refuses to run a second time, so the data is not doubled;
// - it refuses on the live app (NODE_ENV=production) unless the owner asked
//   for a demonstration there:  node tools/seed.js --on-the-live-app
// - if anything fails, nothing is left behind.
//
// What you write is addExampleData(): the app's own example records.

import { randomBytes } from 'node:crypto';
import { tx } from '../core/db.js';
import { audit } from '../core/policy.js';
import { loadConfig } from '../config.js';
import { buildApp } from '../server.js';

// Runs inside one transaction, so it must not be async. users maps each role
// to its example account: users.member.id, users.admin.id. Take the current
// moment from config.now(), and make dates relative to it ("tomorrow", "next
// week"), so the example still looks alive when it is loaded months later.
// Count what you promise: if the hand-over says "slots for the next 14
// days", create fourteen days starting today.
function addExampleData({ db, config, users }) {
  // Example:
  // const tomorrow = new Date(config.now().getTime() + 86400_000).toISOString();
  // db.prepare('INSERT INTO classes (teacher_id, title, starts_at, places, remaining, price_cents, created_at) VALUES (?, ?, ?, 8, 8, 1200, ?)')
  //   .run(users.admin.id, 'Beginners (example)', tomorrow, config.now().toISOString());
}

const quiet = { log() {}, error: console.error };
const config = loadConfig();
let built = null;
const created = [];

try {
  if (config.production && !process.argv.includes('--on-the-live-app')) {
    throw new Error('This is the live app. Example data is only loaded here when the owner asks for a demonstration: add --on-the-live-app.');
  }
  built = await buildApp(config, { log: quiet });
  const { db, auth } = built;
  if (db.prepare("SELECT 1 FROM audit_log WHERE action = 'seed.loaded'").get()) {
    throw new Error('The example data is already loaded. To start again, stop the app, delete the data folder, and run this once more.');
  }

  const users = {};
  for (const role of config.roles) {
    const email = `${role}@example.com`;
    if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) throw new Error(`There is already an account for ${email}.`);
    const password = randomBytes(9).toString('base64url');
    const id = await auth.createUser({ email, name: `Example ${role}`, password, role });
    created.push(id);
    users[role] = { id, email, password, role };
  }
  tx(db, () => {
    addExampleData({ db, config, users });
    audit(db, { action: 'seed.loaded' });
  });

  console.log('Example data loaded. These accounts are for trying the app; the passwords are shown only now:\n');
  for (const u of Object.values(users)) console.log(`  ${u.role.padEnd(12)} ${u.email.padEnd(28)} ${u.password}`);
  console.log('\nEverything this created is made up. Do not use it with real people.');
} catch (err) {
  if (built) for (const id of created) built.db.prepare('DELETE FROM users WHERE id = ?').run(id);
  console.error(`Nothing was loaded: ${err.message}`);
  process.exitCode = 1;
} finally {
  if (built) await built.close();
}

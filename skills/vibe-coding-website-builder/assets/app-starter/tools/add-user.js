// Create an account from the command line. Works the same on Windows, macOS
// and Linux, and at any time (the ADMIN_EMAIL setting only works on the very
// first start with an empty database).
//
//   node tools/add-user.js                         asks for everything
//   node tools/add-user.js --email a@b.org --name "Ann" --role admin
//
// The password is asked for, or generated when you press Enter, and shown
// once. It is never written to a file.

import { randomBytes } from 'node:crypto';
import path from 'node:path';
import readline from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../config.js';
import { createAuth } from '../core/auth.js';
import { migrate, openDb } from '../core/db.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = Object.fromEntries(process.argv.slice(2).join(' ').split('--').filter(Boolean).map((part) => {
  const [key, ...rest] = part.trim().split(' ');
  return [key, rest.join(' ').replace(/^"|"$/g, '')];
}));

const config = loadConfig();
const db = openDb(config.dbFile || path.join(config.dataDir, 'app.db'));
migrate(db, path.join(here, '..', 'migrations'));
const auth = createAuth({ db, config });

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = async (label, fallback = '') => (await rl.question(`${label}${fallback ? ` [${fallback}]` : ''}: `)).trim() || fallback;

try {
  const email = args.email || await ask('Email');
  const name = args.name || await ask('Name', email.split('@')[0]);
  const role = args.role || await ask(`Role (${config.roles.join(', ')})`, config.roles[0]);
  if (!config.roles.includes(role)) throw new Error(`There is no role "${role}". The roles are: ${config.roles.join(', ')}.`);
  let password = args.password || await ask('Password (press Enter to have one made up)');
  const generated = !password;
  if (generated) password = randomBytes(12).toString('base64url');
  if (password.length < 8) throw new Error('The password needs at least 8 characters.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('That does not look like an email address.');

  await auth.createUser({ email, name, password, role });
  console.log(`\nCreated ${role} account for ${email}.`);
  if (generated) console.log(`Password: ${password}\nWrite it down now; it is not stored anywhere readable. Change it after signing in.`);
} catch (err) {
  console.error(`\nNot created: ${err.extra?.fields ? Object.values(err.extra.fields).join(' ') : err.message}`);
  process.exitCode = 1;
} finally {
  rl.close();
  db.close();
}

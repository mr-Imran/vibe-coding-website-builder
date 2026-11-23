// Create an account from the command line. Works the same on Windows, macOS
// and Linux, and at any time (the ADMIN_EMAIL setting only works on the very
// first start with an empty database). On Windows, double-clicking
// add-account.cmd runs this.
//
//   node tools/add-user.js                         asks for everything
//   node tools/add-user.js --email a@b.org --name "Ann" --role admin --generate
//
// --generate makes up the password without asking, and asks nothing else
// either: the name defaults to the first part of the email and the role to
// the first role. Otherwise the password is asked for, or made up when you
// press Enter. A made-up password is shown once. It is never written to a file.
// Do not pass a password on the command line: commands are kept in the
// terminal's history.

import { randomBytes } from 'node:crypto';
import readline from 'node:readline';
import { parseArgs } from 'node:util';
import { loadConfig } from '../config.js';
import { buildApp } from '../server.js';

const quiet = { log() {}, error: console.error };
let built = null;
let rl = null;

try {
  const { values: args } = parseArgs({
    options: {
      email: { type: 'string' }, name: { type: 'string' }, role: { type: 'string' },
      password: { type: 'string' }, generate: { type: 'boolean' },
    },
  });
  const config = loadConfig();
  // The whole app is built (without listening), so a module that reacts to
  // new accounts with auth.on('user.created', ...) does so here as well.
  built = await buildApp(config, { log: quiet });

  // Answers are read line by line, so they can also come from a file or
  // another program, not only from someone typing.
  rl = readline.createInterface({ input: process.stdin });
  const lines = rl[Symbol.asyncIterator]();
  const ask = async (label, fallback = '') => {
    process.stdout.write(`${label}${fallback ? ` [${fallback}]` : ''}: `);
    const { value, done } = await lines.next();
    if (done) process.stdout.write('\n');
    return (done ? '' : String(value).trim()) || fallback;
  };

  const email = (args.email || await ask('Email')).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('That does not look like an email address.');
  // With --generate nothing is asked that has a sensible answer already.
  const name = args.name || (args.generate ? email.split('@')[0] : await ask('Name', email.split('@')[0]));
  const role = args.role || (args.generate ? config.roles[0] : await ask(`Role (${config.roles.join(', ')})`, config.roles[0]));
  if (!config.roles.includes(role)) throw new Error(`There is no role "${role}". The roles are: ${config.roles.join(', ')}.`);
  let password = args.password || (args.generate ? '' : await ask('Password (press Enter to have one made up)'));
  const generated = !password;
  if (generated) password = randomBytes(12).toString('base64url');
  if (password.length < 8) throw new Error('The password needs at least 8 characters.');

  await built.auth.createUser({ email, name, password, role });
  console.log(`\nCreated ${role} account for ${email}.`);
  if (generated) console.log(`Password: ${password}\nWrite it down now; it is not stored anywhere readable. Change it after signing in.`);
} catch (err) {
  console.error(`\nNot created: ${err.extra?.fields ? Object.values(err.extra.fields).join(' ') : err.message}`);
  process.exitCode = 1;
} finally {
  if (rl) rl.close();
  if (built) await built.close();
}

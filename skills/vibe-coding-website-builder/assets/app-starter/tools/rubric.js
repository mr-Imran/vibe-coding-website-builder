// Runs the tests and reports them against the requirement list.
//
//   node tools/rubric.js            print the table
//   node tools/rubric.js --write    also save it as RUBRIC-RESULTS.md
//
// A test counts towards a requirement when its name starts with the
// requirement's id:
//
//   test('A05 the last seat of a class goes to exactly one member', ...)
//
// Tests whose names start with "core" (tests/core.test.js and
// tests/advanced.test.js) check the building blocks that came with the
// starter. They show that the parts work. They do not show that this app uses
// them, so a requirement is only "met" when one of the app's own tests, on the
// app's own data, passes.
//
// M08 (live deployment) is "documented, not yet online" until RUBRIC.md has a
// line "Live address: https://...": a test cannot show that an app is online.
//
// Exit status 1 when a mandatory requirement (M01 to M08) has no passing app
// test, or when any test fails. Advanced requirements (A01 to A08) without an
// app test are reported as "not built", which is right when the app does not
// need them.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const REQUIREMENTS = [
  ['M01', 'Complete functional system: 3 interconnected modules, end-to-end workflow'],
  ['M02', 'Database: CRUD, persistence, data relationships'],
  ['M03', 'Authentication and authorization: secure login, roles, session protection'],
  ['M04', 'Complex business logic: rules, multi-condition workflows'],
  ['M05', 'Dynamic data: search, filter, sort, calculations'],
  ['M06', 'Error and edge cases: validation, duplicate actions, failure recovery'],
  ['M07', 'Responsive UI and accessibility'],
  ['M08', 'Live deployment and documentation'],
  ['A01', 'Real-time sync (two users update the same record at once)'],
  ['A02', 'Intelligent decisions and optimization (conflicting constraints, infeasible request)'],
  ['A03', "Advanced security and access control (modifying another user's restricted record)"],
  ['A04', 'Offline-first (conflicting edits while one client is offline)'],
  ['A05', 'Concurrency and transactions (several users request the last available resource)'],
  ['A06', 'External API and fault tolerance (time-out, malformed data)'],
  ['A07', 'Automated multi-step workflow (a middle step fails after earlier ones succeeded)'],
  ['A08', 'Advanced data processing and analytics (duplicates, missing values, large volumes)'],
];

export function parseTap(output) {
  const results = [];
  let last = null;
  for (const line of output.split(/\r?\n/)) {
    // A group of tests (describe('M03 ...')) has a line of its own, marked
    // type: 'suite' below it. It is not a test: the tests inside it count.
    if (/^\s*type: 'suite'\s*$/.test(line)) {
      if (last) results.splice(results.indexOf(last), 1);
      last = null;
      continue;
    }
    const m = /^\s*(not ok|ok) \d+ - (.*?)(?:\s+# (SKIP|TODO)\b.*)?$/.exec(line);
    if (!m) continue;
    last = null;
    const id = /^(core )?([MA]\d\d)\b/.exec(m[2]);
    if (!id) continue;
    last = { id: id[2], core: Boolean(id[1]), name: m[2], status: m[3] ? 'skipped' : (m[1] === 'ok' ? 'passed' : 'failed') };
    results.push(last);
  }
  return results;
}

// liveAddress: the address written in RUBRIC.md once the owner has published.
// A passing documentation test cannot show that an app is online.
export function summarize(results, { liveAddress = null } = {}) {
  return REQUIREMENTS.map(([id, title]) => {
    const mine = results.filter((r) => r.id === id);
    const app = mine.filter((r) => !r.core && r.status === 'passed').length;
    const core = mine.filter((r) => r.core && r.status === 'passed').length;
    const failed = mine.filter((r) => r.status === 'failed').map((r) => r.name);
    const mandatory = id.startsWith('M');
    let state;
    if (failed.length) state = 'FAILING';
    else if (app && id === 'M08' && !liveAddress) state = 'documented, not yet online';
    else if (app) state = 'met';
    else state = mandatory ? 'NO APP TEST' : 'not built';
    return { id, title, mandatory, app, core, failed, state };
  });
}

export function render(rows) {
  const lines = ['| ID | Requirement | App tests passing | Core tests passing | State |', '|---|---|---|---|---|'];
  for (const r of rows) lines.push(`| ${r.id} | ${r.title} | ${r.app} | ${r.core} | ${r.state} |`);
  const failing = rows.flatMap((r) => r.failed);
  if (failing.length) lines.push('', 'Failing tests:', ...failing.map((f) => `- ${f}`));
  return lines.join('\n');
}

// The date on this computer's calendar, which is the date the person writing
// the README sees. toISOString() would give the date in London, a day off in
// the evening or early morning elsewhere.
export function localDate(moment = new Date()) {
  const two = (n) => String(n).padStart(2, '0');
  return `${moment.getFullYear()}-${two(moment.getMonth() + 1)}-${two(moment.getDate())}`;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const run = spawnSync(process.execPath, ['--test', '--test-reporter=tap'], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  let liveAddress = null;
  try {
    const m = /^Live address:\s*(https:\/\/\S+)/m.exec(fs.readFileSync(path.join(root, 'RUBRIC.md'), 'utf8'));
    liveAddress = m ? m[1] : null;
  } catch { /* no RUBRIC.md yet */ }
  const rows = summarize(parseTap(run.stdout || ''), { liveAddress });
  const table = render(rows);
  console.log(table);
  if (process.argv.includes('--write')) {
    const stamp = localDate();
    fs.writeFileSync(path.join(root, 'RUBRIC-RESULTS.md'),
      `# Test results by requirement\n\nGenerated ${stamp} by \`node tools/rubric.js --write\`.\n\n` +
      'A requirement is "met" when one of this app\'s own tests for it passes. "Core tests" check the parts that came with the starter.\n\n' +
      `${table}\n`);
  }
  const open = rows.filter((r) => r.mandatory && r.state !== 'met' && r.state !== 'documented, not yet online');
  if (run.status !== 0) console.log('\nSome tests are failing. Run "node --test" to see the details.');
  if (open.length) console.log(`\nMandatory requirements without a passing app test: ${open.map((r) => r.id).join(', ')}`);
  if (rows.some((r) => r.state === 'documented, not yet online')) {
    console.log('\nM08: the app is documented but not online. Once it is published, put its address in RUBRIC.md as "Live address: https://..." and run this again.');
  }
  process.exit(run.status === 0 && open.length === 0 ? 0 : 1);
}

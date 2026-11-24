// Starts the real app on a spare port with a throw-away database, and gives
// each pretend user their own cookie jar, the way separate browsers have.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadConfig } from '../config.js';
import { buildApp } from '../server.js';
import { createClient } from '../tools/client.js';
import { onSparePort } from '../tools/ports.js';

const quiet = { log() {}, error() {} };

// setup(built) can create extra tables and routes before the server listens.
export async function startApp({ setup = null, config = {}, dir = null, log = quiet } = {}) {
  const dataDir = dir || fs.mkdtempSync(path.join(os.tmpdir(), 'app-test-'));
  // Tests run on UTC unless they say otherwise, so they give the same answer
  // on every computer. Pass config: { timeZone: 'Europe/London' } to test a
  // rule about a time of day.
  //
  // The clock can be moved while the app runs: t.setClock('2026-03-02T09:59:59Z')
  // makes config.now() answer that moment, t.setClock(null) gives the real
  // time back. A rule about a deadline is then tested one second before it and
  // at it, in one app. config: { now } fixes the clock for the whole run instead.
  let fixed = null;
  const clock = config.now || (() => new Date());
  const now = () => (fixed === null ? clock() : new Date(fixed));
  const built = await buildApp(loadConfig({}, { dataDir, port: 0, host: '127.0.0.1', timeZone: 'UTC', ...config, now }), { log });
  if (setup) await setup(built);
  const server = await onSparePort((port) => built.app.listen(port, '127.0.0.1'));
  const base = `http://127.0.0.1:${server.address().port}`;
  return {
    ...built, base, dataDir, server,
    client: () => createClient(base),
    setClock(moment) {
      if (moment === null || moment === undefined) { fixed = null; return; }
      const ms = new Date(moment).getTime();
      if (Number.isNaN(ms)) throw new Error(`setClock: "${moment}" is not a moment. Write it like 2026-03-02T09:59:59Z.`);
      fixed = ms;
    },
    // Create an account and return a signed-in client for it.
    async user(email, role = null, password = 'correct horse battery') {
      const id = await built.auth.createUser({ email, name: email.split('@')[0], password, role: role || built.config.defaultRole });
      const c = createClient(base);
      const res = await c.post('/api/auth/login', { email, password });
      if (res.status !== 200) throw new Error(`could not sign in ${email}: ${res.status}`);
      c.id = id;
      return c;
    },
    async stop({ keep = false } = {}) {
      await built.close(server);
      if (!keep && !dir) removeFolder(dataDir);
    },
  };
}

// The pretend browser lives in tools/client.js, so that tools/journey.js can
// use it too.
export { createClient } from '../tools/client.js';

// Delete a throw-away folder. On Windows a file that another program still
// has open cannot be deleted, and the error for that (EPERM) would replace
// the failure the test was about to report. So: try a few times, and if the
// folder still cannot go, leave it to the system's own clean-up of the temp
// folder and let the test's real result stand.
export function removeFolder(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); } catch { /* still held by another program */ }
}

// Run several programs at once and wait for every one of them, also when one
// fails. Promise.all gives up at the first failure while the others are still
// running with the database open: the clean-up then fails as well and hides
// what went wrong. Returns one entry per program, { stdout, stderr } or the
// error; check them after.
export async function runAll(jobs) {
  return Promise.all(jobs.map((job) => job.catch((err) => err)));
}

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// What the starter's README.md, RUBRIC.md and RULES.md say where the app's
// own words go. The app's M08 test checks that none is left:
//   assert.doesNotMatch(fs.readFileSync('README.md', 'utf8'), STAND_IN)
// It cannot occur in ordinary writing, so "only replaced" in a sentence is safe.
export const STAND_IN = /\[\[FILL IN[^\]]*\]\]/;

// Widths in a style sheet that do not fit on a phone. The app's M07 test
// asks for none wider than the narrowest phone (320 pixels), and the core
// test runs this on public/app.css, so the app's own styles are checked too.
// It reads width, min-width and flex-basis, in px, rem and em (16 pixels
// each). Not counted: max-width (a ceiling, not a width), min(26rem, 100%)
// (it gives way on a small screen), the larger ends of clamp(), and rules
// inside @media (min-width: ...) for screens wider than a phone.
const toPixels = (n, unit) => Number(n) * (unit.toLowerCase() === 'px' ? 1 : 16);
export function tooWideForAPhone(css, phone = 320) {
  const found = [];
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const open = [];                 // what each open { belongs to: a selector, or an @media line
  let from = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '{') { open.push(text.slice(from, i).trim()); from = i + 1; continue; }
    if (text[i] !== '}') continue;
    const selector = open.pop();
    const body = text.slice(from, i);
    from = i + 1;
    if (selector === undefined || selector.startsWith('@')) continue;
    const wideScreensOnly = open.some((at) => {
      const m = /^@media\b.*\bmin-width\s*:\s*(\d+(?:\.\d+)?)(px|rem|em)/i.exec(at);
      return m && toPixels(m[1], m[2]) > phone;
    });
    if (wideScreensOnly) continue;
    for (const declaration of body.split(';')) {
      const d = /^\s*(width|min-width|flex-basis)\s*:\s*(.+?)\s*(!important)?\s*$/i.exec(declaration);
      if (!d || /^min\(/i.test(d[2])) continue;
      // clamp(smallest, preferred, largest): only the smallest has to fit.
      const value = /^clamp\(/i.test(d[2]) ? d[2].slice(6).split(',')[0] : d[2];
      for (const [, n, unit] of value.matchAll(/(\d+(?:\.\d+)?)(px|rem|em)\b/gi)) {
        const px = toPixels(n, unit);
        if (px > phone) found.push(`${selector} { ${d[1]}: ${d[2].trim()} } is ${Math.round(px)} pixels, wider than a ${phone}-pixel phone`);
      }
    }
  }
  return found;
}

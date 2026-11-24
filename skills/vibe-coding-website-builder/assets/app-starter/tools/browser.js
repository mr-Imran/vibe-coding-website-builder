// A real browser, without a window, pointed at a throw-away copy of the app.
// tools/look.js uses it to take a picture of every screen; tools/journey.js
// uses it to click through the app the way a person would. Not a tool to run
// by itself.
//
//   import { withApp } from './browser.js';
//   await withApp(async (app) => {
//     await app.step('A member books a place', async () => {
//       await app.signIn('member');                 // an example account, by the part of its email before the @
//       await app.go('/classes');
//       await app.press('Book', { near: 'Beginners' });   // the button, in the row or card that says "Beginners"
//       await app.see('Booked.');
//     });
//   });
//
// What a step can do:
//   signIn(key), signOut(), go('/address'), back()
//   fillIn('Label of the field', value)        text, a choice in a list (by its words or its value), true/false for a tick box
//   press('Words on the button or link')       both take { near: 'text of the row, card or list item it is in' }
//                                              and { nth: 2 } for the second of several that match (1 is the first):
//                                              press('Book', { near: '3D printer 2', nth: 1 }) is the top row that says it
//   answer('Words on the button')              a button in the question that is open
//   asOther('member')                          a second person at the same time, in another "browser" without a
//                                              screen: const other = await app.asOther('member2');
//                                              await other.post('/api/bookings', { slot_id: 7 }); then reload and see
//   see('text'), notSee('text')                waits up to five seconds; fails with what the page does show
//   status()                                   what announce() last said
//   count('css selector'), text('css selector'), js('expression'), width(390), shot('name')
//
// Everything runs on a copy: a throw-away database filled by tools/seed.js
// and the app started on a spare port. The real data folder is not touched.
// It needs Chrome or Edge on this computer (CHROME_PATH=... if it is
// somewhere unusual) and no packages. The copy and the browser take spare
// ports; PORTS=3800-3899 keeps them within a range (tools/ports.js).

import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../config.js';
import { signedIn } from './client.js';
import { freePort } from './ports.js';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Where pictures go unless told otherwise: outside the project, so they are
// never uploaded or committed with it.
export function picturesFolder(kind) {
  const slug = loadConfig({}).appName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'app';
  return path.join(os.tmpdir(), `${slug}-${kind}`);
}

// Make a folder ready for a new set of pictures. The tools empty only a
// folder they made themselves (it carries a marker file) or an empty one:
// pointed by mistake at a folder of someone's own files, they stop instead
// of deleting them. Only the pictures are removed, never anything else.
// A tool's own default folder (picturesFolder) that holds nothing but
// pictures is also its own: earlier versions did not leave the marker.
const MARKER = '.pictures-from-the-app-tools';
export function picturesReady(dir) {
  if (fs.existsSync(dir)) {
    const inside = fs.readdirSync(dir);
    const ours = inside.includes(MARKER)
      || (['look', 'journey'].some((kind) => path.resolve(picturesFolder(kind)) === path.resolve(dir)) && inside.every((name) => name.endsWith('.png')));
    if (inside.length && !ours) {
      throw new Error(`${dir} already holds files that these tools did not make, so it was left as it is. Choose a new folder (--out), or an empty one.`);
    }
    for (const name of inside) if (name.endsWith('.png')) fs.rmSync(path.join(dir, name), { force: true });
  }
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, MARKER), 'Pictures of the screens, from tools/look.js or tools/journey.js. Safe to delete.\n');
  return dir;
}

export function findBrowser() {
  const env = process.env;
  const candidates = [env.CHROME_PATH];
  if (process.platform === 'win32') {
    for (const base of [env.PROGRAMFILES, env['PROGRAMFILES(X86)'], env.LOCALAPPDATA]) {
      if (!base) continue;
      candidates.push(path.join(base, 'Google', 'Chrome', 'Application', 'chrome.exe'), path.join(base, 'Microsoft', 'Edge', 'Application', 'msedge.exe'));
    }
  } else if (process.platform === 'darwin') {
    candidates.push('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge', '/Applications/Chromium.app/Contents/MacOS/Chromium');
  } else {
    for (const dir of (env.PATH || '').split(path.delimiter)) {
      for (const name of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'microsoft-edge']) candidates.push(path.join(dir, name));
    }
  }
  return candidates.find((file) => file && fs.existsSync(file)) || null;
}

function removeFolder(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); } catch { /* a program may still hold a file; the system clears temp folders */ }
}

// The app on a spare port, with example data in a throw-away folder.
async function startCopy(dataDir) {
  const env = { ...process.env, DATA_DIR: dataDir, PORT: String(await freePort()), HOST: '127.0.0.1' };
  for (const name of ['NODE_ENV', 'ADMIN_EMAIL', 'ADMIN_PASSWORD', 'APP_ORIGIN', 'SECURE_COOKIES', 'TRUST_PROXY']) delete env[name];
  const seeded = spawnSync(process.execPath, [path.join(root, 'tools', 'seed.js'), '--json'], { cwd: root, env, encoding: 'utf8' });
  if (seeded.status !== 0) throw new Error(`The example data did not load, so there is nobody to sign in as.\n${seeded.stderr || seeded.stdout}`);
  const { accounts } = JSON.parse(seeded.stdout.trim().split('\n').pop());
  const server = spawn(process.execPath, [path.join(root, 'server.js')], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let printed = '';
  const base = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`The app did not start within 20 seconds.\n${printed}`)), 20_000);
    const read = (chunk) => {
      printed += chunk;
      const found = /http:\/\/localhost:(\d+)/.exec(printed);
      if (found) { clearTimeout(timer); resolve(`http://127.0.0.1:${found[1]}`); }
    };
    server.stdout.on('data', read);
    server.stderr.on('data', read);
    server.once('exit', (code) => { clearTimeout(timer); reject(new Error(`The app stopped while starting (exit ${code}).\n${printed}`)); });
  });
  return { base, accounts, server };
}

// The browser, driven over its debugging port.
async function startBrowser(file) {
  const port = await freePort();
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'look-browser-'));
  // No updates or downloads in the background: they leave files in the
  // computer's temp folder that nothing removes.
  const child = spawn(file, ['--headless=new', '--disable-gpu', '--no-first-run', '--hide-scrollbars', '--disable-component-update', '--disable-background-networking',
    '--disable-default-apps', '--disable-sync', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
  let target = null;
  for (let i = 0; i < 80 && !target; i++) {
    await sleep(250);
    try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page'); } catch { /* not up yet */ }
  }
  if (!target) { child.kill(); removeFolder(profile); throw new Error('The browser started but did not answer.'); }
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = () => reject(new Error('Could not connect to the browser.')); });
  let seq = 0;
  const waiting = new Map();
  const listeners = [];
  socket.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.id && waiting.has(message.id)) { waiting.get(message.id)(message); waiting.delete(message.id); }
    else if (message.method) for (const fn of listeners) fn(message.method, message.params);
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++seq;
    waiting.set(id, (message) => (message.error ? reject(new Error(`${method}: ${message.error.message}`)) : resolve(message.result)));
    socket.send(JSON.stringify({ id, method, params }));
  });
  return {
    send,
    on: (fn) => listeners.push(fn),
    async close() { try { socket.close(); } catch { /* already closed */ } child.kill(); await sleep(400); removeFolder(profile); },
  };
}

// These run inside the page. They find things the way a person does: a
// button by the words on it, a field by its label.
const IN_PAGE = `
  const norm = (s) => (s || '').replace(/\\s+/g, ' ').trim();
  const wordsOn = (c) => norm(c.innerText || c.value || c.getAttribute('aria-label') || c.getAttribute('title'));
  // The row, card or list item that says "near". When several say it, the
  // smallest (the row, not the table around it); with nth, the nth of the
  // innermost ones in page order, so { nth: 1 } is the top row.
  function scopeFor(near, nth) {
    const top = document.querySelector('dialog[open]') || document.body;
    if (!near) return { scope: top };
    const boxes = [...top.querySelectorAll('tr, li, article, section, fieldset, form, .card')].filter((b) => norm(b.innerText).includes(near));
    if (!boxes.length) return { problem: 'nothing on the page (no row, card or list item) contains "' + near + '"' };
    if (nth) {
      const innermost = boxes.filter((b) => !boxes.some((o) => o !== b && b.contains(o)));
      if (nth > innermost.length) return { problem: (innermost.length === 1 ? 'only one row, card or list item contains "' : 'only ' + innermost.length + ' rows, cards or list items contain "') + near + '", so there is no number ' + nth };
      return { scope: innermost[nth - 1] };
    }
    return { scope: boxes.reduce((a, b) => (norm(b.innerText).length < norm(a.innerText).length ? b : a)) };
  }
  function press(text, near, nth) {
    const { scope, problem } = scopeFor(near, nth);
    if (problem) return problem;
    const controls = [...scope.querySelectorAll('button, a, [role="button"], summary, input[type="submit"], input[type="button"]')].filter((c) => c.getClientRects().length);
    const exact = controls.filter((c) => wordsOn(c) === text);
    const hits = exact.length ? exact : controls.filter((c) => wordsOn(c).includes(text));
    // Without near, nth counts the buttons themselves: the second "Book" on the page.
    const hit = !near && nth ? hits[nth - 1] : hits[0];
    if (!near && nth && hits.length && !hit) return (hits.length === 1 ? 'only one button or link says "' : 'only ' + hits.length + ' buttons or links say "') + text + '", so there is no number ' + nth;
    if (hit.disabled) return 'the button "' + text + '" is switched off';
    hit.click();
    return '';
  }
  function fillIn(label, value, near, nth) {
    const { scope, problem } = scopeFor(near, nth);
    if (problem) return problem;
    const fields = [...scope.querySelectorAll('input, select, textarea')].filter((f) => f.type !== 'hidden' && f.getClientRects().length);
    const names = (f) => [...(f.labels ? [...f.labels].map((l) => norm(l.innerText)) : []), f.getAttribute('aria-label'), f.placeholder, f.name, f.id].filter(Boolean);
    const hit = fields.find((f) => names(f).includes(label)) || fields.find((f) => names(f).some((n) => n.includes(label)));
    if (!hit) return 'no field is called "' + label + '"' + (near ? ' near "' + near + '"' : '') + '. The ones there: ' + (fields.map((f) => names(f)[0]).filter(Boolean).slice(0, 15).join(' | ') || 'none');
    if (hit.disabled) return 'the field "' + label + '" is switched off';
    if (hit.type === 'checkbox' || hit.type === 'radio') { if (hit.checked !== Boolean(value)) hit.click(); return ''; }
    if (hit.tagName === 'SELECT') {
      const choice = [...hit.options].find((o) => o.value === String(value)) || [...hit.options].find((o) => norm(o.textContent) === String(value));
      if (!choice) return 'the list "' + label + '" has no choice "' + value + '". It has: ' + [...hit.options].map((o) => norm(o.textContent)).join(' | ');
      hit.value = choice.value;
    } else {
      hit.focus();
      hit.value = String(value);
    }
    hit.dispatchEvent(new Event('input', { bubbles: true }));
    hit.dispatchEvent(new Event('change', { bubbles: true }));
    return '';
  }
`;

// Start the copy and the browser. Throws an error with code 'NO_BROWSER'
// when there is no Chrome or Edge.
export async function openApp() {
  const browserFile = findBrowser();
  if (!browserFile) {
    const err = new Error('No Chrome or Edge was found on this computer.\nInstall one, or set CHROME_PATH to the program, or open the app yourself and go through it as each role with the browser window narrow and wide.');
    err.code = 'NO_BROWSER';
    throw err;
  }
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'look-data-'));
  let copy = null;
  let browser = null;
  try {
    copy = await startCopy(dataDir);
    browser = await startBrowser(browserFile);
  } catch (err) {
    if (browser) await browser.close();
    if (copy) copy.server.kill();
    removeFolder(dataDir);
    throw err;
  }
  const { send } = browser;
  const { base, accounts } = copy;

  // What goes wrong on the pages: script errors, blocked content, failed requests.
  let noted = [];
  browser.on((method, params) => {
    if (method === 'Runtime.exceptionThrown') {
      const d = params.exceptionDetails;
      noted.push({ refusal: false, text: `script error: ${(d.exception && d.exception.description) || d.text}`.split('\n')[0] });
    } else if (method === 'Log.entryAdded' && params.entry.level === 'error') {
      const e = params.entry;
      // Refusals are answers, not faults: asking "who am I" while signed out
      // is a 401 on purpose, a wrong password is a 401, a rule saying no is a 403 or 409.
      if (e.source === 'network' && /\/api\/auth\/me$/.test(e.url || '')) return;
      const refusal = e.source === 'network' && /status of (401|403|404|409|422|429)/.test(e.text) && /\/api\//.test(e.url || '');
      noted.push({ refusal, text: `${e.source === 'security' ? 'blocked by the security policy' : e.source}: ${e.text}${e.url ? ` (${e.url.replace(base, '')})` : ''}` });
    } else if (method === 'Runtime.consoleAPICalled' && params.type === 'error') {
      noted.push({ refusal: false, text: `console.error: ${params.args.map((a) => a.value ?? a.description ?? '').join(' ')}` });
    }
  });
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Log.enable');
  await send('Network.enable');

  async function js(expression) {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(`in the page: ${(result.exceptionDetails.exception && result.exceptionDetails.exception.description) || result.exceptionDetails.text}`);
    return result.result ? result.result.value : undefined;
  }
  const inPage = (call) => js(`(() => { ${IN_PAGE}; return ${call}; })()`);

  // Wait until the page has stopped changing address and nothing says it is still loading.
  async function settle() {
    let last = null;
    let steady = 0;
    for (let i = 0; i < 60 && steady < 3; i++) {
      await sleep(150);
      let now;
      try { now = await js("document.readyState + ' ' + location.href + ' ' + document.querySelectorAll('[aria-busy=\"true\"], button[disabled][data-busy]').length"); } catch { now = null; }
      steady = now && now === last && now.startsWith('complete') && now.endsWith(' 0') ? steady + 1 : 0;
      last = now;
    }
  }
  const where = () => js('location.pathname');
  const countFrom1 = (nth) => {
    if (nth === null || nth === undefined) return null;
    if (!Number.isInteger(nth) || nth < 1) throw new Error(`nth: ${nth} is not a place in a list. 1 is the first, 2 the second.`);
    return nth;
  };
  const shown = () => js('(document.querySelector("dialog[open]") || document.body).innerText');
  const act = async (problem) => { if (problem) throw new Error(problem); await settle(); };

  const steps = [];
  let stopped = false;
  const app = {
    base, accounts, send, js, settle, where,
    // The example account whose email starts with this ("member" for member@example.com).
    account(key) {
      const found = accounts.find((a) => a.email.split('@')[0] === key);
      if (!found) throw new Error(`There is no example account "${key}". tools/seed.js makes: ${accounts.map((a) => a.email.split('@')[0]).join(', ')}.`);
      return found;
    },
    async go(address) { await send('Page.navigate', { url: base + address }); await settle(); },
    async back() { await js('history.back()'); await sleep(600); await settle(); },
    width: (px) => send('Emulation.setDeviceMetricsOverride', { width: px, height: 900, deviceScaleFactor: 1, mobile: px < 600 }),
    async signIn(who) {
      const account = typeof who === 'string' ? app.account(who) : who;
      await send('Network.clearBrowserCookies');
      await app.go('/login');
      await js(`{ const f = document.getElementById('auth-form'); f.elements.email.value = ${JSON.stringify(account.email)}; f.elements.password.value = ${JSON.stringify(account.password)}; f.requestSubmit(); }`);
      for (let i = 0; i < 40 && (await where()).startsWith('/login'); i++) await sleep(150);
      await settle();
      if ((await where()).startsWith('/login')) throw new Error(`could not sign in as ${account.email}: ${(await shown()).replace(/\s+/g, ' ').slice(0, 200)}`);
    },
    async signOut() {
      await js("document.getElementById('sign-out').click()");
      for (let i = 0; i < 40 && !(await where()).startsWith('/login'); i++) await sleep(150);
      await settle();
      if (!(await where()).startsWith('/login')) throw new Error('the Sign out button did not lead to the sign-in page');
    },
    press: async (text, { near = null, nth = null } = {}) => act(await inPage(`press(${JSON.stringify(text)}, ${JSON.stringify(near)}, ${JSON.stringify(countFrom1(nth))})`)),
    fillIn: async (label, value, { near = null, nth = null } = {}) => act(await inPage(`fillIn(${JSON.stringify(label)}, ${JSON.stringify(value)}, ${JSON.stringify(near)}, ${JSON.stringify(countFrom1(nth))})`)),
    // Another person, signed in at the same time in their own pretend browser
    // (tools/client.js): get, post, put, patch and delete, with their own
    // cookie and session token. For "two people go for the last place": the
    // other one takes it, then this page tries.
    asOther: (who) => signedIn(base, typeof who === 'string' ? app.account(who) : who),
    async answer(text) {
      if (!(await js('Boolean(document.querySelector("dialog[open]"))'))) throw new Error(`no question is open to answer "${text}"`);
      await app.press(text);
    },
    async see(text, { timeout = 5000 } = {}) {
      let last = '';
      for (let waited = 0; waited <= timeout; waited += 150) {
        last = await js('document.body.innerText');
        if (last.includes(text)) return;
        await sleep(150);
      }
      throw new Error(`expected to see "${text}" on ${await where()}. The page shows: ${last.replace(/\s+/g, ' ').slice(0, 400)}`);
    },
    async notSee(text) {
      await settle();
      if ((await js('document.body.innerText')).includes(text)) throw new Error(`"${text}" is on ${await where()} and should not be`);
    },
    status: () => js("(document.getElementById('status') || {}).textContent || ''"),
    count: (selector) => js(`document.querySelectorAll(${JSON.stringify(selector)}).length`),
    text: (selector) => js(`(document.querySelector(${JSON.stringify(selector)}) || {}).textContent || ''`),
    async shot(file) {
      const size = await js('JSON.stringify({ w: document.documentElement.clientWidth, h: Math.min(8000, Math.max(document.documentElement.scrollHeight, 900)) })').then(JSON.parse);
      const picture = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width: size.w, height: size.h, scale: 1 } });
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, Buffer.from(picture.data, 'base64'));
      return file;
    },
    // Faults the pages reported since the last call. A request the server
    // refused (a wrong password, a rule saying no) is part of a journey, so
    // it is left out unless asked for; a page that is refused something
    // while it merely loads is a fault, and look.js asks for those.
    takeNoted({ refusals = false } = {}) {
      const found = [...new Set(noted.filter((n) => refusals || !n.refusal).map((n) => n.text))];
      noted = [];
      return found;
    },

    // One step of a journey. After the first step that fails, the rest are
    // skipped: they would only fail for the same reason.
    steps,
    async step(title, work) {
      if (stopped) { steps.push({ title, state: 'skipped' }); return; }
      try {
        await work();
        const faults = app.takeNoted();
        if (faults.length) throw new Error(`the page reported: ${faults.join('; ')}`);
        steps.push({ title, state: 'ok' });
      } catch (err) {
        stopped = true;
        let picture = null;
        try { picture = await app.shot(path.join(picturesReady(picturesFolder('journey')), `failed-step-${steps.length + 1}.png`)); } catch { /* the page may be gone */ }
        steps.push({ title, state: 'FAILED', why: err.message, picture });
      }
    },
    async close() {
      await browser.close();
      copy.server.kill();
      await sleep(400);
      removeFolder(dataDir);
    },
  };
  await app.width(1280);
  return app;
}

// Run a journey and report it. Exit status: 0 every step worked, 1 a step
// failed, 2 it could not run (no browser, or the app did not start).
export async function withApp(journey) {
  let app;
  try {
    // Pictures of steps that failed last time are gone before this run starts.
    const old = picturesFolder('journey');
    if (fs.existsSync(old)) picturesReady(old);
    app = await openApp();
  } catch (err) {
    console.error(`The journey was not run: ${err.message}`);
    process.exitCode = 2;
    return;
  }
  try {
    await journey(app);
  } catch (err) {
    app.steps.push({ title: 'outside any step', state: 'FAILED', why: err.message });
  } finally {
    await app.close();
  }
  for (const s of app.steps) {
    console.log(`  ${s.state.padEnd(7)} ${s.title}`);
    if (s.why) console.log(`          ${s.why}${s.picture ? `\n          picture: ${s.picture}` : ''}`);
  }
  const failed = app.steps.filter((s) => s.state !== 'ok');
  if (failed.length) {
    console.log(`\n${app.steps.filter((s) => s.state === 'ok').length} of ${app.steps.length} steps worked. Fix the first one that failed and run this again.`);
    process.exitCode = 1;
  } else {
    console.log(`\n${app.steps.length === 1 ? 'The one step' : `All ${app.steps.length} steps`} worked, clicked and typed in a real browser.`);
  }
}

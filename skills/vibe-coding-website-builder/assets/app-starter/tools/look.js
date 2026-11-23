// Look at every screen the way each kind of user sees it, without opening a
// window: sign in as each example account, open every page in the menu at a
// phone width and a desktop width, save a picture of each, and report what a
// test that only reads files cannot see.
//
//   node tools/look.js                        every role, every menu page, 390 and 1280 wide
//   node tools/look.js --page /classes/new    also a page that no menu entry leads to (repeatable)
//   node tools/look.js --out pictures         where the pictures go (default: look/ in this folder)
//
// It reports, for each page: an error in a script, anything the security
// policy blocked, a request that failed, a page that scrolls sideways, and
// the words "null" or "undefined" printed where a value was missing. Then,
// for each role, it signs out and presses Back, which must not show the
// previous person's page again.
//
// It runs on its own copy: a throw-away database filled by tools/seed.js and
// the app started on a spare port. Your data folder is not touched, and the
// app does not need to be running. It needs Chrome or Edge on this computer
// (CHROME_PATH=... if it is somewhere unusual). No packages.
//
// The pictures still have to be looked at: this finds faults a program can
// name, not a layout that is merely ugly. Exit status: 0 nothing found,
// 1 something found, 2 it could not run (no browser, or the app did not start).

import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WIDTHS = [390, 1280];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function options(argv) {
  const out = { pages: [], dir: path.join(root, 'look') };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--page' && argv[i + 1]) out.pages.push(argv[++i]);
    else if (argv[i] === '--out' && argv[i + 1]) out.dir = path.resolve(argv[++i]);
    else throw new Error(`Not understood: ${argv[i]}. See the top of tools/look.js.`);
  }
  return out;
}

function findBrowser() {
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

const freePort = () => new Promise((resolve, reject) => {
  const probe = net.createServer();
  probe.once('error', reject);
  probe.listen(0, '127.0.0.1', () => { const { port } = probe.address(); probe.close(() => resolve(port)); });
});

function removeFolder(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); } catch { /* a program may still hold a file; the system clears temp folders */ }
}

// The app on a spare port, with example data in a throw-away folder.
async function startCopy(dataDir) {
  const env = { ...process.env, DATA_DIR: dataDir, PORT: '0', HOST: '127.0.0.1' };
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
  const child = spawn(file, ['--headless=new', '--disable-gpu', '--no-first-run', '--hide-scrollbars', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
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
    async js(expression) {
      const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      return result.result ? result.result.value : undefined;
    },
    async close() { try { socket.close(); } catch { /* already closed */ } child.kill(); await sleep(400); removeFolder(profile); },
  };
}

const opts = options(process.argv.slice(2));
const browserFile = findBrowser();
if (!browserFile) {
  console.error('No Chrome or Edge was found on this computer, so the screens were not looked at.\nInstall one, or set CHROME_PATH to the program, or open the app yourself and look at each page as each role with the browser window narrow and wide.');
  process.exit(2);
}

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'look-data-'));
let copy = null;
let browser = null;
const faults = [];
const seen = [];

try {
  copy = await startCopy(dataDir);
  browser = await startBrowser(browserFile);
  const { send, js } = browser;
  const { base } = copy;
  fs.mkdirSync(opts.dir, { recursive: true });

  // What goes wrong on the page currently open.
  let noted = [];
  browser.on((method, params) => {
    if (method === 'Runtime.exceptionThrown') {
      const d = params.exceptionDetails;
      noted.push(`script error: ${(d.exception && d.exception.description) || d.text}`.split('\n')[0]);
    } else if (method === 'Log.entryAdded' && params.entry.level === 'error') {
      const e = params.entry;
      // Asking "who am I" while signed out is answered 401 on purpose.
      if (e.source === 'network' && /\/api\/auth\/me$/.test(e.url || '')) return;
      noted.push(`${e.source === 'security' ? 'blocked by the security policy' : e.source}: ${e.text}${e.url ? ` (${e.url.replace(base, '')})` : ''}`);
    } else if (method === 'Runtime.consoleAPICalled' && params.type === 'error') {
      noted.push(`console.error: ${params.args.map((a) => a.value ?? a.description ?? '').join(' ')}`);
    }
  });
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Log.enable');
  await send('Network.enable');

  // Wait until the page has stopped changing address and nothing says it is still loading.
  async function settle() {
    let last = null;
    let steady = 0;
    for (let i = 0; i < 60 && steady < 3; i++) {
      await sleep(150);
      let now;
      try { now = await js("document.readyState + ' ' + location.href + ' ' + document.querySelectorAll('[aria-busy=\"true\"]').length"); } catch { now = null; }
      steady = now && now === last && now.startsWith('complete') && now.endsWith(' 0') ? steady + 1 : 0;
      last = now;
    }
  }
  const go = async (address) => { await send('Page.navigate', { url: base + address }); await settle(); };
  const where = () => js('location.pathname');
  const setWidth = (width) => send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 600 });

  async function shoot(label, address, width) {
    noted = [];
    await go(address);
    const landed = await where();
    const facts = await js(`JSON.stringify({
      sideways: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      height: Math.min(8000, Math.max(document.documentElement.scrollHeight, 900)),
      stray: (document.body.innerText.match(/\\b(null|undefined|NaN)\\b|\\[object Object\\]/) || [null])[0],
      heading: (document.querySelector('h1') || {}).textContent || '',
    })`).then(JSON.parse);
    const name = `${label}-${address === '/' ? 'home' : address.replace(/^\//, '').replace(/[^a-z0-9]+/gi, '-')}-${width}.png`;
    const picture = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width, height: facts.height, scale: 1 } });
    fs.writeFileSync(path.join(opts.dir, name), Buffer.from(picture.data, 'base64'));
    const found = [...new Set(noted)];
    if (facts.sideways > 1) found.push(`scrolls sideways: the page is ${facts.sideways} pixels wider than the screen`);
    if (facts.stray) found.push(`shows the word "${facts.stray}" where a value was missing`);
    if (landed !== address && !(address === '/' && landed === '/index')) found.push(`ended up on ${landed}`);
    seen.push({ label, address, width, heading: facts.heading.trim(), name, found });
    for (const f of found) faults.push(`${label}, ${address}, ${width} wide: ${f}`);
  }

  // Nobody signed in.
  for (const width of WIDTHS) { await setWidth(width); await shoot('signed-out', '/login', width); }
  noted = [];
  await go('/');
  if (!(await where()).startsWith('/login')) faults.push(`signed out, /: a page for signed-in people opened without signing in (ended on ${await where()})`);

  for (const account of copy.accounts) {
    const label = account.email.split('@')[0];
    await send('Network.clearBrowserCookies');
    await setWidth(WIDTHS[WIDTHS.length - 1]);
    await go('/login');
    await js(`{ const f = document.getElementById('auth-form'); f.elements.email.value = ${JSON.stringify(account.email)}; f.elements.password.value = ${JSON.stringify(account.password)}; f.requestSubmit(); }`);
    for (let i = 0; i < 40 && (await where()).startsWith('/login'); i++) await sleep(150);
    await settle();
    if ((await where()).startsWith('/login')) { faults.push(`${label}: could not sign in with the account the example data made`); continue; }
    const menu = await js("JSON.stringify([...document.querySelectorAll('#nav a')].map((a) => a.getAttribute('href')))").then(JSON.parse);
    const pages = [...new Set(['/', ...menu, ...opts.pages])].filter((p) => p.startsWith('/') && !p.startsWith('//'));
    for (const width of WIDTHS) {
      await setWidth(width);
      for (const address of pages) await shoot(label, address, width);
    }

    // Sign out, then press Back: the last person's page must not come back.
    const last = pages[pages.length - 1];
    await go(last);
    const before = await js("(document.getElementById('who-name') || {}).textContent || ''");
    await js("document.getElementById('sign-out').click()");
    for (let i = 0; i < 40 && !(await where()).startsWith('/login'); i++) await sleep(150);
    if (!(await where()).startsWith('/login')) { faults.push(`${label}: the Sign out button on ${last} did not lead to the sign-in page`); continue; }
    await js('history.back()');
    await sleep(600);
    await settle();
    const after = await js("JSON.stringify({ at: location.pathname, name: (document.getElementById('who-name') || {}).textContent || '', hidden: document.documentElement.hidden })").then(JSON.parse);
    if (!after.at.startsWith('/login') && after.name && !after.hidden) {
      faults.push(`${label}: after signing out, the Back button showed ${after.at} again with "${after.name || before}" on it. The next person at this computer would see it.`);
    }
  }
} catch (err) {
  console.error(`The screens could not be looked at: ${err.message}`);
  process.exitCode = 2;
} finally {
  if (browser) await browser.close();
  if (copy) { copy.server.kill(); await sleep(400); }
  removeFolder(dataDir);
}

if (process.exitCode !== 2) {
  console.log(`Looked at ${seen.length} screens (${[...new Set(seen.map((s) => s.label))].join(', ')}; ${WIDTHS.join(' and ')} pixels wide).\n`);
  for (const s of seen) console.log(`  ${s.found.length ? 'FAULT' : 'ok   '}  ${s.label.padEnd(12)} ${s.address.padEnd(18)} ${String(s.width).padStart(4)}  ${s.heading.slice(0, 40)}`);
  console.log(`\nPictures: ${opts.dir}`);
  if (faults.length) {
    console.log(`\n${faults.length} ${faults.length === 1 ? 'thing' : 'things'} to fix:`);
    for (const f of faults) console.log(`  - ${f}`);
    process.exitCode = 1;
  } else {
    console.log('\nNo script errors, nothing blocked, no page scrolling sideways, and Back after signing out shows nothing.\nNow open the pictures: this cannot tell whether a screen looks right.');
  }
}

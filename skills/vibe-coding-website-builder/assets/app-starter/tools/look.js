// Look at every screen the way each kind of user sees it, without opening a
// window: sign in as each example account, open every page in the menu at a
// phone width and a desktop width, save a picture of each, and report what a
// test that only reads files cannot see.
//
//   node tools/look.js                        every role, every menu page, 390 and 1280 wide
//   node tools/look.js --page /classes/new    also a page that no menu entry leads to (repeatable)
//   node tools/look.js --out pictures         where the pictures go: a new or empty folder, or one
//                                             this tool made before (only its old pictures are removed)
//
// It reports, for each page: an error in a script, anything the security
// policy blocked, a request that failed, a page that scrolls sideways, and
// the words "null" or "undefined" printed where a value was missing. Then,
// for each role, it signs out and presses Back, which must not show the
// previous person's page again.
//
// The pictures go to a folder outside the project (it prints where), so they
// are never uploaded or committed with the app. It runs on its own copy: a
// throw-away database filled by tools/seed.js and the app started on a spare
// port. Your data folder is not touched, and the app does not need to be
// running. It needs Chrome or Edge on this computer (CHROME_PATH=... if it
// is somewhere unusual). No packages.
//
// It opens pages; it does not press anything. tools/journey.js does that.
// And the pictures still have to be looked at: this finds faults a program
// can name, not a layout that is merely ugly. Exit status: 0 nothing found,
// 1 something found, 2 it could not run (no browser, or the app did not start).

import path from 'node:path';
import { openApp, picturesFolder, picturesReady } from './browser.js';

const WIDTHS = [390, 1280];

function options(argv) {
  const out = { pages: [], dir: picturesFolder('look') };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--page' && argv[i + 1]) out.pages.push(argv[++i]);
    else if (argv[i] === '--out' && argv[i + 1]) out.dir = path.resolve(argv[++i]);
    else throw new Error(`Not understood: ${argv[i]}. See the top of tools/look.js.`);
  }
  return out;
}

const opts = options(process.argv.slice(2));
const faults = [];
const seen = [];
let app = null;

try {
  app = await openApp();
  const { js, where } = app;
  picturesReady(opts.dir);       // removes last time's pictures; refuses a folder of other files

  async function shoot(label, address, width) {
    app.takeNoted({ refusals: true });
    await app.go(address);
    const landed = await where();
    const facts = await js(`JSON.stringify({
      sideways: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      stray: (document.body.innerText.match(/\\b(null|undefined|NaN)\\b|\\[object Object\\]/) || [null])[0],
      heading: (document.querySelector('h1') || {}).textContent || '',
    })`).then(JSON.parse);
    const name = `${label}-${address === '/' ? 'home' : address.replace(/^\//, '').replace(/[^a-z0-9]+/gi, '-')}-${width}.png`;
    await app.shot(path.join(opts.dir, name));
    const found = app.takeNoted({ refusals: true });
    if (facts.sideways > 1) found.push(`scrolls sideways: the page is ${facts.sideways} pixels wider than the screen`);
    if (facts.stray) found.push(`shows the word "${facts.stray}" where a value was missing`);
    if (landed !== address && !(address === '/' && landed === '/index')) found.push(`ended up on ${landed}`);
    seen.push({ label, address, width, heading: facts.heading.trim(), name, found });
    for (const f of found) faults.push(`${label}, ${address}, ${width} wide: ${f}`);
  }

  // Nobody signed in.
  for (const width of WIDTHS) { await app.width(width); await shoot('signed-out', '/login', width); }
  await app.go('/');
  if (!(await where()).startsWith('/login')) faults.push(`signed out, /: a page for signed-in people opened without signing in (ended on ${await where()})`);

  for (const account of app.accounts) {
    const label = account.email.split('@')[0];
    await app.width(WIDTHS[WIDTHS.length - 1]);
    try { await app.signIn(account); } catch { faults.push(`${label}: could not sign in with the account the example data made`); continue; }
    const menu = await js("JSON.stringify([...document.querySelectorAll('#nav a')].map((a) => a.getAttribute('href')))").then(JSON.parse);
    const pages = [...new Set(['/', ...menu, ...opts.pages])].filter((p) => p.startsWith('/') && !p.startsWith('//'));
    for (const width of WIDTHS) {
      await app.width(width);
      for (const address of pages) await shoot(label, address, width);
    }

    // Sign out, then press Back: the last person's page must not come back.
    const last = pages[pages.length - 1];
    await app.go(last);
    try { await app.signOut(); } catch { faults.push(`${label}: the Sign out button on ${last} did not lead to the sign-in page`); continue; }
    await app.back();
    const after = await js("JSON.stringify({ at: location.pathname, name: (document.getElementById('who-name') || {}).textContent || '', hidden: document.documentElement.hidden })").then(JSON.parse);
    if (!after.at.startsWith('/login') && after.name && !after.hidden) {
      faults.push(`${label}: after signing out, the Back button showed ${after.at} again with "${after.name}" on it. The next person at this computer would see it.`);
    }
  }
} catch (err) {
  console.error(`The screens could not be looked at: ${err.message}`);
  process.exitCode = 2;
} finally {
  if (app) await app.close();
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
    console.log('\nNo script errors, nothing blocked, no page scrolling sideways, and Back after signing out shows nothing.\nNow open the pictures: this cannot tell whether a screen looks right. And run tools/journey.js: this opened pages but pressed nothing.');
  }
}

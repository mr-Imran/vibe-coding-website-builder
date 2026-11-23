# Building an app

Read this when the person needs more than pages: accounts, their own saved
data, different kinds of user, things that can run out, rules about who may
do what. It covers the eight requirements every app built with this skill
must meet (M01 to M08). The advanced ones (A01 to A08) are in
`references/app-advanced.md`; putting an app online is in
`references/app-publish.md`.

## Contents

1. Site or app
2. What an app is made of
3. Before you write anything
4. Start from the starter
5. Building a module
6. The pages
7. The eight requirements and their tests
8. Running it and looking at it
9. Documents the app must carry
10. Handing over

## 1. Site or app

| The person wants | Build |
|---|---|
| To show what they offer and be contacted; a link to pay or book | A simple site (`references/build.md`) |
| People signing in; each person's own data; staff and customers seeing different things; bookings, orders or stock that the system keeps track of | An app (this file) |

When it could be either, prefer the site with a hosted service behind a link:
it is free to run, and nothing in it can leak. Say so in one sentence and let
the person choose. An app costs a little to host (about five US dollars a
month to stay awake), needs one program installed on the person's computer
(Node.js), and holds other people's data, which is a responsibility.

Some things are still better bought than built, even inside an app: taking
card payments (a payment link or the payment company's hosted checkout),
sending email in bulk, video calls. The app records the result; the service
does the risky part.

## 2. What an app is made of

One Node.js program, one database file, no packages to install.

```
<project folder>/
├── server.js            starts the app
├── config.js            settings; secrets come from the environment
├── core/                sign-in, database, safety helpers. Tested; change with care.
├── migrations/          the database tables, one numbered .sql file per change
├── modules/             the app's own parts: one file each, listed in index.js
├── public/              the pages, styles and page scripts
├── tests/               the proof: one test file per module, plus the core's
├── tools/rubric.js      runs the tests and reports them against the requirements
├── data/                the database file (created when the app runs; never shared)
├── README.md            what it is and how to run it
├── RUBRIC.md            where each requirement is met and how to see it
└── site-notes.txt       for the owner, in plain words
```

Everything the person's visitors can do goes through `server.js`. The pages
are plain HTML, CSS and JavaScript with no build step, as in a simple site,
but they are opened through the running app (`http://localhost:3000`), not by
double-clicking a file.

**Why this shape.** The owner cannot repair a broken toolchain, so there is
none: `node server.js` is the whole procedure. And because the app runs
entirely on the person's computer, you can prove it works before anything is
published: start it, sign in as two people at once, fight over the last seat,
make the outside service time out. An app that depends on accounts the owner
has not opened yet cannot be tested, only hoped about.

## 3. Before you write anything

Work these out and tell the owner in plain words, as a short list. No approval
is needed; it lets them stop you if you misunderstood.

- **The kinds of user** (roles) and what each may do. Two or three is normal:
  the people who run it, and the people who use it.
- **Three or more parts that depend on each other** (modules). Not three
  unrelated screens: each part uses the others' data. Example for a studio:
  *members* (who they are, what plan they have), *classes* (when, how many
  places), *bookings* (which member has which place). A booking needs a member
  and a class; a class's free places come from its bookings.
- **One journey that crosses all of them**, start to finish, for each kind of
  user. "A member signs up, finds a class, books a place; the teacher sees the
  list; the member cancels and the place opens up again."
- **The rules**, written as sentences. These are the business's own rules and
  the heart of the app: "A member can hold at most three bookings at a time."
  "Cancelling less than two hours before the class still uses a credit."
  "Only teachers may open the list of who is coming." Ask the owner for them.
  Where you cannot ask, write down the rules you assumed in `RULES.md`, mark
  each as assumed, and list them under "I need these from you". Rules you
  made up and did not disclose are the app-sized version of an invented
  review.
- **Which advanced requirements apply.** Build the ones the person asked for.
  Two are not optional when they apply, because without them the app is wrong:
  private records need the access rules of A03, and anything that can run out
  (seats, stock, slots) needs the transaction of A05.

Check Node.js before going further: `node --version` must print 22.13 or
newer. If it is missing or older, that is the one thing the owner has to
install: nodejs.org, the "LTS" installer, default choices. Give them those
steps and wait; do not install it for them unasked.

## 4. Start from the starter

Copy the whole of `assets/app-starter/` (in this skill's folder) into the
project folder, including the files whose names start with a dot. Then:

1. Run `node --test` in the project folder. All of the core's tests must pass
   before you add anything, so you know the starting point works on this
   machine.
2. Name the app: `appName` and the roles in `config.js`, the name in
   `package.json`, and "My app" in the pages under `public/`.
3. Set the roles, most powerful first. The first one manages people. Set
   `timeZone` to where the business is.

The starter already has these screens, which every app needs: sign in and
create an account (`login.html`), a home page, "Your account" with a password
change, and "People" for the highest role (add someone, change a role, switch
an account off, set a new password for someone who is locked out). The menu
on every signed-in page comes from `MENU` in `public/js/shell.js`; add the
app's pages there, and start each page's script with `startPage()` from that
file.

What `core/` gives you, so that you do not write it again:

| File | Use it for |
|---|---|
| `db.js` | `tx(db, fn)` for all-or-nothing changes; `migrate`; `now()`; `ident()` |
| `time.js` | `localParts()` and `zonedToUtc()` for rules about the clock on the wall where the business is |
| `auth.js` | Sign-up, sign-in, sign-out, password change, managing people; the guards `auth.requireUser` and `auth.requireRole('admin')` |
| `validate.js` | `check(body, schema)` for everything a person sends; `idParam()` |
| `errors.js` | `notFound()`, `forbidden()`, `conflict()`, `invalid()`: answers a person can read |
| `policy.js` | `guardRecord()` for "may this user touch this record"; `audit()` |
| `records.js` | `listQuery()` for search, filter, sort, pages and totals; `updateVersioned()`; `takeOne()` |
| `idempotency.js` | `once(ctx, work)` so a double click or a resend happens once |
| `realtime.js` | Live updates to the people allowed to see them (A01) |
| `external.js` | Calling outside services without hanging or crashing (A06) |
| `workflow.js` | Multi-step jobs that undo themselves when a step fails (A07) |
| `csv.js` | Importing files with duplicates and gaps, with a report (A08) |
| `solve.js` | Working out a plan under rules, or explaining why none exists (A02) |

Use these helpers. Each one exists because the hand-written version of it is
where apps built in a hurry go wrong: a list that puts the search text into
the SQL, an edit that silently overwrites someone else's, a "last seat" that
two people both get. If a helper does not fit, extend it and keep its tests
passing; do not go around it.

Leave the tests in `tests/core.test.js` and `tests/advanced.test.js` in
place. They are named "core ..." and prove the parts; the app's own tests
prove the app. They run with their own roles and their own tables (named
`t_...`, with routes under `/api/_t/`), so the app's roles, tables and routes
cannot collide with them. Do not use those two prefixes yourself.

Leave the helpers the app does not use where they are, too (`sw.js`,
`js/offline.js`, `js/live.js` and the rest). They do nothing unless a page
loads them, and the core tests import them.

## 5. Building a module

A module is a migration, a file in `modules/`, and a test file.

**The tables** go in a new numbered file, `migrations/002_classes.sql`. Say
what is true in the table itself, so that no code path can break it:

```sql
CREATE TABLE classes (
  id         INTEGER PRIMARY KEY,
  teacher_id INTEGER NOT NULL REFERENCES users(id),
  title      TEXT NOT NULL,
  starts_at  TEXT NOT NULL,                              -- ISO time, UTC
  places     INTEGER NOT NULL CHECK (places >= 0),
  remaining  INTEGER NOT NULL CHECK (remaining >= 0),    -- can never go below zero
  price_cents INTEGER NOT NULL CHECK (price_cents >= 0), -- money as whole cents, never 9.99
  version    INTEGER NOT NULL DEFAULT 1,                 -- for edits by two people at once
  created_at TEXT NOT NULL,
  updated_at TEXT
);
CREATE INDEX classes_starts ON classes(starts_at);

CREATE TABLE bookings (
  id        INTEGER PRIMARY KEY,
  class_id  INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  member_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status    TEXT NOT NULL DEFAULT 'booked' CHECK (status IN ('booked', 'cancelled')),
  created_at TEXT NOT NULL,
  UNIQUE (class_id, member_id)                           -- one booking per member per class
);
```

**The routes** go in `modules/bookings.js`, registered in `modules/index.js`:

```js
import { tx, now } from '../core/db.js';
import { conflict, invalid } from '../core/errors.js';
import { once } from '../core/idempotency.js';
import { guardRecord } from '../core/policy.js';
import { takeOne } from '../core/records.js';
import { check, idParam } from '../core/validate.js';

const MAX_OPEN_BOOKINGS = 3;
const rules = {
  entity: 'booking',
  read:  (u, b) => u.role === 'admin' || b.member_id === u.id,
  write: (u, b) => u.role === 'admin' || (b.member_id === u.id && b.status === 'booked'),
};

export function register(app, { db, auth, hub }) {
  app.post('/api/bookings', auth.requireRole('member', 'admin'), (ctx) => once(ctx, async () => {
    const { class_id } = check(await ctx.body(), { class_id: { type: 'int', required: true, min: 1, label: 'Class' } });
    const id = tx(db, () => {                                   // everything below happens, or none of it
      const cls = db.prepare('SELECT * FROM classes WHERE id = ?').get(class_id);
      if (!cls) throw invalid({ class_id: 'That class does not exist.' });
      if (cls.starts_at <= now()) throw conflict('This class has already started.');
      const open = db.prepare("SELECT COUNT(*) AS n FROM bookings WHERE member_id = ? AND status = 'booked'").get(ctx.user.id).n;
      if (open >= MAX_OPEN_BOOKINGS) throw conflict(`You can hold at most ${MAX_OPEN_BOOKINGS} bookings at a time.`);
      if (!takeOne(db, 'classes', class_id)) throw conflict('Sorry, the last place has just been taken.');
      return Number(db.prepare('INSERT INTO bookings (class_id, member_id, created_at) VALUES (?, ?, ?)')
        .run(class_id, ctx.user.id, now()).lastInsertRowid);
    });
    hub.publish('class.changed', { id: class_id }, { audience: () => true });
    ctx.status(201);
    return { id };
  }));

  app.get('/api/bookings/:id', auth.requireUser, (ctx) => {
    const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(idParam(ctx.params.id));
    return { booking: guardRecord(ctx, booking, rules, 'read') };
  });
}
```

What that example does, and every route must do:

- **Decide on the server.** The page may hide a button; the route still
  checks the role, the ownership and every rule. Someone can send a request
  without the page.
- **Check everything that arrives** with `check()`. It refuses fields that
  are not in the schema, so nobody can send `"role": "admin"` or
  `"owner_id": 5` along with a form.
- **Never put a value into SQL text.** Values go in `?` places. Column names
  from a request go through `listQuery()`.
- **One transaction per action** (`tx`), with nothing awaited inside it. Read
  the request body before the transaction; send live updates after it.
  `guardRecord` also goes before the transaction: when it refuses, it writes
  a line to the audit log and throws, and inside a transaction that line would
  be rolled back with everything else.
- **Rules live in one place**, next to the data they guard, as named
  constants and short functions, so the test can name the rule it proves.
- **A record fetched by id is guarded** with `guardRecord` before it is
  shown or changed.
- **Times are stored in UTC** (`now()`), money in whole cents. Format for
  people in the page. A rule about a time of day ("has the 9 o'clock class
  started?", "no bookings after 6 pm the day before") is about the clock
  where the business is: convert with `localParts()` and `zonedToUtc()` from
  `core/time.js` and `config.timeZone`. Take the current moment from
  `config.now()`, never `new Date()` directly, so that a test can set the
  clock (`startApp({ config: { now: () => new Date('2026-03-02T08:55:00Z') } })`)
  and check the rule exactly at its edge.
- **A list that needs columns from two tables** (a booking with its class
  title) is a view: create it in a migration and give its name to
  `listQuery()`. Pass `sums: { total: 'price_cents' }` for a total over
  everything that matches the search and filters, not just the page shown.
- **Messages are written for the person**, saying what happened and what they
  can do: "Sorry, the last place has just been taken", not "409".

## 6. The pages

Follow `references/build.md` for the look, phone layout and accessibility:
an app's screens are still web pages. What differs:

- Addresses start with a slash (`/app.css`, `/js/classes.js`), because pages
  are served by the app. The check has a note about this; for an app it does
  not apply.
- **No script written inside a page.** The app sends a security policy that
  only runs script files from `public/js/`. Each page ends with
  `<script type="module" src="/js/that-page.js"></script>`. This is what stops
  text typed by one user from running as code in another user's browser, so
  do not loosen it.
- **Build what is shown with `el()`** from `js/api.js`, or `textContent`.
  Never join strings into HTML when any part came from a person or the
  database.
- **Talk to the server only through `api()`.** It adds the session token and
  the key that makes a resend harmless, and gives one kind of error.
- **Every screen has four states**: loading, nothing here yet (with what to
  do next), the data, and something went wrong (with a way to try again).
- **Every form** shows the server's field messages next to the fields
  (`showFieldErrors`), keeps what the person typed, and cannot be sent twice
  (`withBusy`).
- **Every list** of more than a handful has search, at least one filter, a
  way to sort, and pages; and shows a calculated figure where one makes sense
  (a total, a count, what is left).
- Pages for one role send others away with `requireSession(['admin'])`. That
  is for comfort only; the route is what protects the data.
- Yellow notes still apply to anything only the owner knows (their real
  class times, their prices).

## 7. The eight requirements and their tests

A requirement is met when the app does it and one of the app's own tests
proves it. Name each test with the requirement's id at the start; the report
tool counts them. Put them in `tests/<module>.test.js`, using
`tests/helpers.js` (`startApp`, `t.user(email, role)`), which runs the real
app with a throw-away database and gives each pretend user their own cookies.

```js
test('M04 a member with three open bookings cannot book a fourth', async () => { ... });
```

| ID | Done means | The app's test must show |
|---|---|---|
| **M01** Complete system, 3 connected modules, end-to-end | Three or more modules that use each other's data, and the main journey works from the first screen to the last for each role | One test that walks the whole journey through the routes, touching all three modules, and checks the effect in each (the booking exists, the class has one place fewer, the member's list shows it) |
| **M02** Database: CRUD, persistence, relationships | Each main thing can be created, read, changed and deleted; data survives a restart; tables are linked with `REFERENCES` and the links are enforced | Create, read, update, delete for the app's main records; a restart with the same data folder still has the data; deleting a parent does what the relationship says (refused, or children removed) |
| **M03** Sign-in, roles, session protection | The core's sign-in is used unchanged; every route has a guard; each role reaches only its own routes | For each role, one route it must be refused on (403) and one it may use; no route of the app answers without a session (401), checked for every route in a loop |
| **M04** Complex business logic | The rules from section 3 are enforced on the server, including ones with several conditions at once | One test per rule: the case that is allowed, the case that is refused, and the edge between them (exactly at the limit, exactly at the deadline) |
| **M05** Search, filter, sort, calculations | Lists use `listQuery`; totals and counts are calculated by the database over everything that matches, not just the page shown | Search finds the right rows, each filter narrows, each sort orders, pages add up, and a calculated figure matches a hand count |
| **M06** Errors and edge cases | Bad input is refused field by field; a repeated action happens once; a failure part-way leaves nothing half done; the page says what went wrong | For the main form: empty, too long, wrong type, impossible values; the same request sent twice with one key makes one record; an action that fails in its second step leaves the first step undone |
| **M07** Responsive UI and accessibility | The pages pass the page check, work at phone width, and can be used with a keyboard alone | A test like the core's M07 test, run over the app's own pages (viewport, language, one main heading, a label for every field); and the page check's score in the report |
| **M08** Live deployment and documentation | The app is online at an address the owner sent you, and `README.md` and `RUBRIC.md` are filled in | That `README.md` and `RUBRIC.md` exist and have their sections filled, that no stand-in text is left in them, and that `/api/health` answers. The live address is recorded in `RUBRIC.md` once the owner has published |

The M08 test cannot prove the app is live; only the address can. The report
tool shows M08 as "documented, not yet online" until `RUBRIC.md` has a line
`Live address: https://...`, which you add when the owner has published and
sent you the address. Report it to the owner in the same words.

Tests that send many wrong passwords from one place run into the sign-in
limit (five per account, twenty per address, in fifteen minutes). Clear it
between such tests: `t.db.prepare('DELETE FROM login_attempts').run()`.

Run `node tools/rubric.js --write` when you are done. It lists each
requirement with the number of app tests and core tests passing, and saves
the table as `RUBRIC-RESULTS.md`. It exits with an error while a mandatory
requirement has no passing app test.

Tests that only repeat the code prove nothing. Write each one as a short
story about a person ("a member with three bookings tries a fourth") and
check what that person and the database end up with.

## 8. Running it and looking at it

- Start it: `node server.js`, then open `http://localhost:3000`. On
  Windows the owner can double-click `start-app.cmd` in the project folder
  instead; the window that opens must stay open while they use the app. On
  macOS and Linux: open a terminal in the folder and type `node server.js`.
  Write whichever applies to their computer into `site-notes.txt`, including
  how to stop it (close the window, or Ctrl+C).
- Settings such as another port are written differently per system:
  `PORT=3100 node server.js` on macOS and Linux, and in Windows PowerShell
  `$env:PORT=3100; node server.js`. Give the owner only the form for their
  system.
- Create the first administrator with `node tools/add-user.js`. It asks for
  the email, name and role, and makes up a password if none is typed, showing
  it once. It works on every system and at any time. Tell the owner the
  password once in your reply and do not write it into any file. (On a host,
  the first administrator comes from the `ADMIN_EMAIL` and `ADMIN_PASSWORD`
  settings instead, which only take effect while the database has no accounts
  at all.)
- For a demonstration, write `tools/seed.js`: it fills the app with believable
  example data and one account per role, generates their passwords when it
  runs, and prints them. Example data is labelled as such in the README and is
  never loaded on the live app unless the owner asks.
- Look at every screen as each role, at phone width and desktop width. With
  no browser tool, a headless browser does it: Chrome and Edge can be started
  without a window and driven from a short Node script over their debugging
  port (`--headless=new --remote-debugging-port=...`), which also reports
  script errors and security-policy violations; see the last section of
  `references/build.md`. Try the journey from section 3 by hand once. Then try
  to break it: the back button after signing out, a second tab, a form sent
  empty, the address of someone else's record.
- Run the page check on the project folder as for a site
  (`scripts/site_check.py`). It reads `public/`. Stop the app when you are
  done, and say so.

## 9. Documents the app must carry

**`README.md`**, for anyone who has to run or judge the app:

1. What it is and who uses it, in three sentences.
2. How to run it on a computer (Node version, `node server.js`, the address).
3. The roles and what each can do. How to get an account for each (the seed
   script); never real passwords.
4. The modules and how they depend on each other.
5. The rules, as the sentences from `RULES.md`.
6. How it is tested (`node --test`, `node tools/rubric.js`) and the result.
7. Where it is online, once it is, and how it is hosted.
8. What it does not do.

**`RUBRIC.md`**, one row per requirement, mandatory and advanced:

| ID | Where in the app | How to see it | Test that proves it |
|---|---|---|---|
| M04 | `modules/bookings.js`, rules at the top | Sign in as a member, book three classes, try a fourth | `tests/bookings.test.js`: "M04 a member with three open bookings cannot book a fourth" |

Rows for advanced requirements that were not built say "not built" and why
("no outside service is used"). Do not claim a row the tests do not back.

**`RULES.md`**, the business rules as sentences, each marked "from the
owner" or "assumed".

**`site-notes.txt`**, for the owner, in plain words: how to start the app
and open it, how to sign in, how to ask for changes, what is still marked
yellow or assumed, and how it is published.

## 10. Handing over

Report in the shape of the build report in SKILL.md, with these differences:

- **To see it**: the command that starts it and the address, and which account
  to sign in with. Not "double-click index.html".
- **What was proven**: the requirement table from `tools/rubric.js`, and the
  page check's score, each with its one-line caveat (the tests cover what
  they cover; the score is a checklist).
- **What I assumed**: every rule you made up, for the owner to confirm.
- **I need these from you**: real data, confirmations, and for publishing, the
  accounts in `references/app-publish.md`.
- **What it costs to keep online**, before they ask.
- **Publishing** is theirs to start. If they are not there to ask, write the
  steps from `references/app-publish.md` into `site-notes.txt` with this
  app's real names, and report M08 as documented, not yet online.

Do not say an app is secure. Say what was tested, and that an app holding
other people's data deserves a second look by someone who can read code
before it holds anything sensitive.

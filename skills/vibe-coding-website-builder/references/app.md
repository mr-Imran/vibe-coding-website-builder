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
├── tools/               rubric.js (the tests, counted against the requirements),
│                        add-user.js (make an account), seed.js (example data),
│                        look.js (every screen in a browser, as every role),
│                        journey.js (the main journey, clicked and typed in a browser)
├── start-app.cmd, add-account.cmd, load-example-data.cmd
│                        the same three things by double-click, on Windows
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
is needed; it lets them stop you if you misunderstood. If the owner cannot
be reached while you work, the plan is not skipped: it becomes the first
part of the hand-over, as "What it does" and "What I assumed" (section 10).

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
  each as assumed, list them in the hand-over under "What I assumed", and
  ask for a yes or no on them as one item under "I need these from you".
  Rules you
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
   machine. The three `.cmd` files must keep their Windows line endings (a
   core test checks): change them, if ever, with an editor, never with a
   Unix tool such as `sed -i`, which rewrites every line. Every other file
   has Unix line endings, and the starter's `.gitattributes` keeps it so.
2. Name the app: `appName` in `config.js`, the name and the description in
   `package.json`, and "My app" in every page under `public/` (the title,
   the description, the link at the top left of each, and the line above
   the sign-in form), and the title of `README.md` (a `[[FILL IN]]` mark
   until then). No script holds the name. A core test ("core M08
   every page carries the app's name") fails while a page's title lacks the
   name or "My app" is left anywhere in `public/`, so run the tests after
   renaming and it tells you what you missed. No test sees the look: give
   `public/favicon.svg` the app's first letter and its colour (the starter's
   is an "A" on blue), and set `--accent` at the top of `app.css` to the
   same colour.
3. Set the roles in `config.js`, most powerful first, and `defaultRole`. The
   first one manages people. Nothing else needs renaming: the People screen
   and its menu entry are written for `'top'`, which means "the first role,
   whatever it is called", and the core's tests bring their own roles.
4. Leave `timeZone` alone unless the business is somewhere other than the
   owner's computer. It is that computer's own zone unless the `TIME_ZONE`
   setting says otherwise. On a host it must be set (`app-publish.md`),
   because hosts run on UTC.

The starter already has these screens, which every app needs: sign in and
create an account (`login.html`), a home page, "Your account" with a password
change, "People" for the first role (find someone, add someone, change a
role, switch an account off, set a new password for someone who is locked
out, download a backup), and "Activity" for the first role (sign-ins,
changes to accounts, and what was refused and to whom). The menu on every signed-in page comes from `MENU` in
`public/js/shell.js`; add the app's pages there, and start each page's script
with `startPage()` from that file: `startPage()` for anyone signed in,
`startPage(['staff', 'manager'])` for named roles, `startPage('top')` for the
first role.

**People, and the app's own people.** The starter's People screen is about
accounts: who can sign in, with which role, and their password. Many apps
also need a screen about the same people as the business sees them (members
to approve, students and their credits). Keep both and make the difference
plain in their names: rename the starter's menu entry and heading to
"Accounts", call the app's own screen by the business's word ("Members"),
and put a line on each that links to the other. Do not merge the app's
fields into the starter's screen; it is covered by core tests as it is.
The file stays `people.html` and the address stays `/people` (a core test
looks for the menu entry by that address); only the words change.

**Activity.** The Activity screen lists the audit log. The core writes to it
by itself: sign-ins and failed sign-ins, changes to accounts, a route called
by a role that may not use it, a record refused by `guardRecord()`, and
every refusal that names its rule (`conflict('...', { rule: 'max_open' })`).
It does not list: a refusal that names no rule, input refused as invalid
(422), a request from someone not signed in (401), or one with a wrong or
missing session token. So never write "every refused attempt" in the
hand-over or the README; say what is there: "staff see failed sign-ins,
attempts to use a page or a record that is not theirs, and bookings refused
by a rule, with who tried". A module adds its own lines with `audit()` (a
member approved, a booking cancelled by staff). Give those lines words in
`ACTIONS`, and the app's rules words in `RULES` (`max_upcoming: 'Already had
2 upcoming bookings'`), in `public/js/activity-words.js`, which belongs to
the app; `activity.js` itself stays as it came.

What `core/` gives you, so that you do not write it again:

| File | Use it for |
|---|---|
| `db.js` | `tx(db, fn)` for all-or-nothing changes; `migrate`; `now()`; `ident()` |
| `time.js` | `localParts()` and `zonedToUtc()` for rules about the clock on the wall where the business is |
| `auth.js` | Sign-up, sign-in, sign-out, password change, managing people; the guards `auth.requireUser` and `auth.requireRole('admin')`; `auth.on('user.created' / 'user.changed', fn)` to react to accounts |
| `validate.js` | `check(body, schema)` for everything a person sends, including lists (`type: 'list'`); `idParam()` |
| `errors.js` | `notFound()`, `forbidden()`, `conflict()`, `invalid()`: answers a person can read. Each takes a last argument that names the rule: `conflict('...', { rule: 'max_open' })` |
| `policy.js` | `guardRecord()` for "may this user touch this record" (rules with `key: 'user_id'` for a record not keyed by `id`); `audit()` |
| `activity.js` | `GET /api/activity`: the audit log as a list for the first role, with a count of refusals. Already registered, with its screen |
| `records.js` | `listQuery()` for search, checked filters, sort (one column or a named order over several), pages, totals and counts; `updateVersioned()` for edits; `takeOne()` and its mirror image `giveBack()` for things that run out. The last three find a row by `id`, or by another column with `{ key: 'user_id' }` |
| `backup.js` | `GET /api/backup`: the first role downloads a copy of the whole database. Already registered and on the People screen |
| `idempotency.js` | `once(ctx, work)` so a double click or a resend happens once |
| `realtime.js` | Live updates to the people allowed to see them (A01) |
| `external.js` | Calling outside services without hanging or crashing (A06) |
| `workflow.js` | Multi-step jobs that undo themselves when a step fails (A07) |
| `csv.js` | Importing files with duplicates and gaps, with a report (A08) |
| `solve.js` | Working out a plan under rules, or explaining why none exists (A02) |

And in `public/js/`, for the pages:

| File | Use it for |
|---|---|
| `api.js` | `api()` for every request; `el()` to build what is shown and `fill()` to replace what is inside a node; `showFieldErrors()`, `withBusy()`, `announce()` |
| `shell.js` | `startPage()`: the session, the menu, sign out |
| `ui.js` | `createList()`: a list with search, filters, order, pages and its four states, also for a short list from a route that answers with a plain array; `ask()`: a yes-or-no question in the page |

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
import { tx } from '../core/db.js';
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

export function register(app, { db, config, auth, hub }) {
  app.post('/api/bookings', auth.requireRole('member', 'admin'), (ctx) => once(ctx, async () => {
    const { class_id } = check(await ctx.body(), { class_id: { type: 'int', required: true, min: 1, label: 'Class' } });
    const at = config.now().toISOString();                      // the business's clock: a test can set it
    const id = tx(db, () => {                                   // everything below happens, or none of it
      const cls = db.prepare('SELECT * FROM classes WHERE id = ?').get(class_id);
      if (!cls) throw invalid({ class_id: 'That class does not exist.' });
      if (cls.starts_at <= at) throw conflict('This class has already started.', { rule: 'started' });
      const open = db.prepare("SELECT COUNT(*) AS n FROM bookings WHERE member_id = ? AND status = 'booked'").get(ctx.user.id).n;
      if (open >= MAX_OPEN_BOOKINGS) throw conflict(`You can hold at most ${MAX_OPEN_BOOKINGS} bookings at a time.`, { rule: 'max_open' });
      if (!takeOne(db, 'classes', class_id)) throw conflict('Sorry, the last place has just been taken.', { rule: 'full' });
      return Number(db.prepare('INSERT INTO bookings (class_id, member_id, created_at) VALUES (?, ?, ?)')
        .run(class_id, ctx.user.id, at).lastInsertRowid);
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
  When a route can refuse for more than one reason, name the reason in the
  refusal: `conflict('...', { rule: 'max_open' })`,
  `forbidden('...', { rule: 'not_approved' })`. The page reads it as
  `err.rule` and a test as `res.body.error.rule`, so neither has to
  recognise a rule by the wording of its message.
- **An edit sends back the version it started from**, and the route hands it
  to `updateVersioned()` as it arrived:
  `const { version, ...rest } = await ctx.body();` (safe: `ctx.body()`
  answers 400 itself for a body that is `null`, a list or a bare value, so
  what comes back is always an object) then
  `const input = check(rest, SCHEMA, { partial: true });` then
  `updateVersioned(db, 'classes', id, version, input, [...columns])`.
  A version that is missing or not a whole number is answered 422 by the
  helper; one that is out of date is answered 409 with the record as it is
  now. Do not check the version yourself.
- **A record fetched by id is guarded** with `guardRecord` before it is
  shown or changed, and before the request body is read or checked. Guard
  first, then validate: the other way round, a malformed request aimed at
  someone else's record is answered "your input is wrong" (which tells them
  the record exists) and never reaches the audit log. On a route that is
  also wrapped in `once()` (cancel, approve: addressed by id, and harmless
  when sent twice), the guard goes outside and `once()` around the rest, so
  that every attempt by a stranger is refused and logged afresh:

  ```js
  app.post('/api/bookings/:id/cancel', auth.requireUser, (ctx) => {
    const booking = guardRecord(ctx, load(idParam(ctx.params.id)), rules, 'write');
    return once(ctx, async () => cancel(booking));
  });
  ```
- **A role, or a record?** `auth.requireRole('staff')` is for a route that
  is about a kind of thing (the list of machines, adding a machine): a
  member who calls it is refused with 403 and an `auth.denied` line naming
  the address. When the route is about one record and the rule depends on
  that record, even if today it is only a role ("a member may read their
  own profile; only staff may change it"), use `auth.requireUser` and
  `guardRecord(ctx, record, rules, 'write')` with the role inside the rule.
  That gives the answer A03 asks for (404 for a record they may not see, 403
  for one they may see but not change) and an `access.denied` line with the
  record's number. Both are logged; pick by what the route addresses.
- **Something that belongs to every account** (an approval, a profile, a
  credit balance) gets its own table keyed by the user's id. Do not edit
  `core/auth.js` to add columns. Create the row when the account is created:
  `auth.on('user.created', (user) => db.prepare('INSERT INTO profiles (user_id) VALUES (?)').run(user.id))`,
  in the module's `register`. Such a table is keyed by `user_id`, not `id`,
  so tell the helpers:
  `updateVersioned(db, 'profiles', user.id, version, input, columns, { key: 'user_id' })`,
  and the same last argument for `takeOne()` and `giveBack()` (a credit
  balance). It fires for every new account, however it was
  made, in the same transaction. Decide the row's default from the role,
  and say in `RULES.md` what an account of each role starts with (a staff
  account made with `add-account.cmd` needs no approval). The core tests
  run the app's listeners with their own roles (`admin`, `member`), so a
  listener must not fail for a role name the app does not have. `auth.on('user.changed', (user, before) => ...)`
  fires when a role changes or an account is switched off or on; use it when
  that should have a consequence (their future bookings are released). When
  nothing needs to happen, "no row means the default" is simpler still.
- **A list inside a form** (the days a class runs, several tags) is
  `{ type: 'list', of: { type: 'int', min: 0, max: 6 }, unique: true }` in the
  schema. It arrives as an array; store it as its own table when the app
  searches by it, or as `JSON.stringify(value)` in a text column when it is
  only shown.
- **Times are stored in UTC** (`now()`), money in whole cents. Format for
  people in the page. A rule about a time of day ("has the 9 o'clock class
  started?", "no bookings after 6 pm the day before") is about the clock
  where the business is: convert with `localParts()` and `zonedToUtc()` from
  `core/time.js` and `config.timeZone`.
- **Things that repeat** ("a few slots per day on each machine", "a class
  every Tuesday") are rows the app makes itself, not example data: real
  slots cannot come from `tools/seed.js`. Keep a rolling window: before the
  first request and the first request of each new local day, with
  `app.everyNewDay((day) => keepSlotsAhead(db, day))` in the module's
  `register` (it follows `config.now()`, so `t.setClock()` moves it too),
  and when a machine is added, insert the slots for today and the next N
  days with
  `INSERT OR IGNORE` against `UNIQUE (machine_id, starts_at)`, so running it
  twice adds nothing. Store each slot's local day and wall-clock times
  (`day`, `starts`, `ends` as the owner says them) beside the UTC moment,
  so pages show them without converting. Two traps: in the evening, today
  has no bookable slot left, so say "today and the 13 days after", not "14
  days"; and slots already made keep the zone they were made in, so set
  `TIME_ZONE` before the first start on a host (`app-publish.md`). The slot
  times themselves are the owner's to give: until they do, they are an
  assumption in `RULES.md` and a yellow note on the screen that shows them.
- **There are two clocks, on purpose.** `config.now()` is the business's
  clock. Use it for every rule ("has it started?", "is the deadline past?")
  and for every time the app's own tables store (`created_at`, `booked_at`,
  `cancelled_at`): `const at = config.now().toISOString()`. A test can set
  it (`startApp({ config: { now: () => new Date('2026-03-02T08:55:00Z') } })`),
  or move it while the app runs (`t.setClock('2026-03-02T08:59:59Z')`, then
  `t.setClock('2026-03-02T09:00:00Z')`, and `t.setClock(null)` for the real
  time again), and check a rule exactly at its edge, and what the rule compares against
  was stamped by the same clock. `now()` from `core/db.js` is the real
  clock. The core uses it for its own bookkeeping, which must not move when
  a test sets the time: sessions, the sign-in limit, and the `at` column of
  `audit_log`. So a figure worked out from the audit log ("refusals in the
  last 7 days") compares against `now()`, not `config.now()`. Never call
  `new Date()` for the current moment in a module. One more stamp is the
  real clock's unless you say otherwise: `updateVersioned()` sets
  `updated_at`. Pass `{ at }` as its last argument when a rule or a list
  reads that column.
- **A list that needs columns from two tables** (a booking with its class
  title) is a view: create it in a migration and give its name to
  `listQuery()`. Pass `sums: { total: 'price_cents' }` for a total over
  everything that matches the search and filters, not just the page shown;
  `sums: { open: { count: 'remaining > 0 AND active = 1' } }` counts the
  matching rows that meet a condition, with no extra column in the view.
  A figure that depends on a value of yours (the clock, the person asking)
  takes it in `params`, never pasted into the text:
  `upcoming: { count: 'starts_at > ?', params: [at] }`.
  Sums follow the search and the filters, as they should for "N matching".
  A figure that must not change when the person narrows the list (how many
  of their 2 bookings they have used) comes from a route or a query of its
  own, not from `sums`.
  The view needs a column called `id` (rows that tie are ordered by it), or
  pass `tiebreak: 'some_unique_column'`. For an order over several columns
  ("by day, then start time, then room"), name it:
  `sorts: { timetable: ['day', 'starts_at', 'room'] }`, asked for with
  `?sort=timetable`. A column written with a minus runs against the others:
  `waiting_first: ['approved', '-created_at']` is "not yet approved first,
  and within each group the newest first". `?sort=-waiting_first` turns
  every column round.
- **A filter is checked like a form field.** In `listQuery()`'s `filters`,
  give each one the rule its value must meet:
  `status: { check: { type: 'enum', values: ['booked', 'cancelled'] } }`,
  `class_id: { check: { type: 'int', min: 1 } }`. Then `?status=maybe` is
  answered 422 with the reason, not with an empty list that looks like "no
  bookings". A filter whose condition has to be worked out takes a `where`
  function: it gets the checked value and returns `{ sql, params }`, or
  `null` for no condition. "Upcoming only", as a tick box:
  `upcoming: { check: { type: 'bool' }, where: (on) => (on ? { sql: 'starts_at >= ?', params: [config.now().toISOString()] } : null) }`.
  "On this day", where the day is local and the stored times are UTC:
  `day: { check: { type: 'date' }, where: (d) => ({ sql: 'starts_at >= ? AND starts_at < ?', params: dayRange(d) }) }`,
  with `dayRange` built from `zonedToUtc()` for midnight that day and the
  next. A condition that does not come from the address at all (only this
  member's rows) goes in `where`, beside `filters`.
- **Messages are written for the person**, saying what happened and what they
  can do: "Sorry, the last place has just been taken", not "409".

## 6. The pages

Follow `references/build.md` for the look, phone layout and accessibility:
an app's screens are still web pages. What differs:

- Addresses start with a slash (`/app.css`, `/js/classes.js`), because pages
  are served by the app. Link to a page without its ending (`/book`, not
  `/book.html`); the app serves `book.html` for it, and the page check knows
  that for an app.
- **No script and no style written inside a page.** The app sends a security
  policy that only runs script files from `public/js/` and only applies
  styles from its own stylesheets. Each page ends with
  `<script type="module" src="/js/that-page.js"></script>`. A `<style>`
  block or a `style="..."` attribute is ignored without any error, so a page
  can look right in your head and wrong in the browser: put it in `app.css`
  as a class. For a value only known when the page runs (a bar's width),
  pass an object: `el('div', { class: 'bar', style: { width: '40%' } })`.
  This policy is what stops text typed by one user from running as code in
  another user's browser, so do not loosen it.
- **Build what is shown with `el()`** from `js/api.js`, or `textContent`.
  Never join strings into HTML when any part came from a person or the
  database. `el()` leaves out a child that is `null` or `false`, so a part
  can be conditional. To replace what is inside a node, use
  `fill(node, ...children)` from the same file, which does the same; the
  browser's own `node.replaceChildren(text, more ? button : null)` prints
  the word "null" on the page. A core test refuses `replaceChildren` in
  page scripts for that reason.
- **Talk to the server only through `api()`.** It adds the session token and
  the key that makes a resend harmless, and gives one kind of error.
- **Every screen has four states**: loading, nothing here yet (with what to
  do next), the data, and something went wrong (with a way to try again).
  `createList()` gives a list all four, also a short one with no search or
  pages (four machines): a route that answers with a plain array is enough.
- **Every form** shows the server's field messages next to the fields
  (`showFieldErrors`), keeps what the person typed, and cannot be sent twice
  (`withBusy`).
- **Every field has a label**: a `<label for="the field's id">`, or the
  field inside its `<label>`. A core test reads every page for it. A tick
  box with words beside it is
  `<label class="check" for="upcoming"><input id="upcoming" name="upcoming" type="checkbox" value="1"> Upcoming only</label>`;
  the Activity screen has one among its filters. Tick boxes and radio
  buttons are sized as themselves; do not style them as full-width fields.
- **Text only for people creating an account** ("a member of staff has to
  approve you before you can book") goes in the `signup-note` paragraph of
  `login.html`. The sign-in page shows it in that mode only; no script
  needs changing.
- **Every action says what happened**, with `announce('Booked.')` or
  `announce('That slot has just been taken.', 'error')`. The message appears
  at the bottom of the window wherever the person has scrolled to, and is
  read out by screen readers. Each signed-in page needs
  `<p id="status" role="status" aria-live="polite"></p>` for it. Do not use
  the browser's own `alert`, `confirm` or `prompt` boxes: ask in the page.
  For a yes-or-no question (delete, cancel, switch off) that is
  `if (await ask({ title: 'Cancel this booking?', text: '...', yes: 'Cancel the booking', danger: true }))`
  from `js/ui.js`; nothing has to be added to the page's HTML. For a
  question that needs something typed, the People screen's "set a new
  password" dialog is the pattern.
- **Every list** of more than a handful has search, at least one filter, a
  way to sort, and pages; and shows a calculated figure where one makes sense
  (a total, a count, what is left). `createList()` from `js/ui.js` is that
  list, written once: give it the route, the table's `<tbody>`, a function
  that builds one row, a `<form>` whose named fields are the search box, the
  filters and the order, and an element for the pages. It shows the four
  states, waits a moment while someone types, ignores an answer that a
  newer search has overtaken, and steps back when the last row of the last
  page is removed. The People screen (`people.html`, `js/people.js`) is the
  example to copy, including the figure above the list. `loaded(data)` runs
  before the rows are built, and each row gets the whole answer as its
  second argument (`row: (booking, data) => ...`), so a row can use what
  came with it (the server's "now", what this person may still book). The names of the
  form's fields also work in the page's address, so a figure on the home
  page can link to the list already narrowed: `/members?approved=0`.
- **Every table works on a phone.** Give it `class="stack"`, make the first
  cell of each row a `<th scope="row">`, and give every other cell
  `data-label="Column name"`: on a narrow screen each row becomes a card
  with the column names beside the values. The People screen shows how. A
  table left to scroll sideways hides its right-hand columns, which is where
  the buttons usually are.
- **"Today" on a page is the business's day**, not the visitor's
  computer's: `businessDay()` from `js/api.js` gives
  `{ today: '2026-03-02', time: '18:40', weekday: 1, timeZone }` as the
  server saw it when the page loaded (it comes with `/api/auth/me` and
  follows `config.now()`). A figure such as "bookings today" asks the
  server, which uses the same clock.
- Pages for some roles send others away with `startPage(['staff'])`. That
  is for comfort only; the route is what protects the data.
- Yellow notes still apply to anything only the owner knows (their real
  class times, their prices). The style is already in `app.css`:
  `<mark class="needs-you">your slot times</mark>`. The page check counts
  them and says "not yet" while one is left (section 10 says how to report
  that).

## 7. The eight requirements and their tests

A requirement is met when the app does it and one of the app's own tests
proves it. Name each test with the requirement's id at the start; the report
tool counts them. Put them in `tests/<module>.test.js`, and the ones that
are about the whole app (M01's journey, M03's and A03's loops, A05's race)
in files of their own such as `tests/system.test.js`, `tests/access.test.js`
and `tests/concurrency.test.js`. A file whose name does not end in
`.test.js` (`tests/makerspace.js`, for shared set-up) is not run as tests.
Use `tests/helpers.js`: `startApp()` runs the real app with a throw-away
database, `t.user(email, role)` gives each pretend user their own cookies,
`t.setClock()` moves the business clock, `tooWideForAPhone()` and
`STAND_IN` are the checks for M07 and M08 below.

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
| **M07** Responsive UI and accessibility | The pages pass the page check, work at phone width, and can be used with a keyboard alone | What the core's M07 test does not already check (see below); and the page check's score in the report |
| **M08** Live deployment and documentation | The app is online at an address the owner sent you, and `README.md` and `RUBRIC.md` are filled in | That `README.md`, `RUBRIC.md` and `RULES.md` exist and that no stand-in is left in them (`assert.doesNotMatch(text, STAND_IN)`: the starter marks each gap `[[FILL IN: ...]]`, which no sentence contains), and that `/api/health` answers. The live address is recorded in `RUBRIC.md` once the owner has published |

The M08 test cannot prove the app is live; only the address can. The report
tool shows M08 as "documented, not yet online" until `RUBRIC.md` has a line
`Live address: https://...`, which you add when the owner has published and
sent you the address. Report it to the owner in the same words.

**The loop for M03 and A03.** "Checked for every route" means reading the
app's own list of routes, not typing the addresses out again (a route added
later would then be missed). `startApp()` returns the app as `t.app`, and
`t.app.routes` is every route: `{ method, pattern, opts }`, where `pattern`
is the address as written (`/api/bookings/:id`) and `opts.public` is true
for the few that need no session.

```js
test('M03 no route of the app answers without a session', async () => {
  const open = ['/api/health'];                       // answers without a session on purpose
  for (const route of t.app.routes.filter((r) => !r.opts.public && !open.includes(r.pattern))) {
    const res = await t.client().request(route.method, route.pattern.replace(/:\w+/g, '1'), route.method === 'GET' ? undefined : {});
    assert.ok([401, 403].includes(res.status), `${route.method} ${route.pattern} answered ${res.status}`);
  }
});
```

The same list drives A03's loop: for every route whose `pattern` has `:id`
in it, a signed-in user who does not own record 1 is refused. **Record 1
must exist and belong to someone else, for every kind of record the routes
address.** "Not found" is also what a route answers when there is no record
1 at all, so on an empty database the loop is green and proves nothing.
Before the loop, create the records as another user and assert that each
has the number 1 (`assert.equal(made.body.id, 1)`); after it, assert that
each is unchanged and that `audit_log` has gained `access.denied` lines.
Where record 1 cannot be someone else's (user 1 is usually the first staff
account), make it so: in that test file, create a member before any staff
(`t.user()` allows it), so that account 1, their profile and their booking 1
all belong to one member, and the stranger is a second member. Where even
that cannot be, prove that route's ownership rule in a test of its own. Some records
are meant to be seen by everyone who is signed in (a class, a machine), and
their read route rightly answers 200. Name those in a list at the top of
the test, the way `open` is above, each with its reason in a comment, and
leave every other route in the loop:

```js
const shared = ['GET /api/classes/:id'];                // any member may look at a class; changing it is still refused below
for (const route of t.app.routes.filter((r) => r.pattern.includes(':id') && !shared.includes(`${r.method} ${r.pattern}`))) {
  const res = await stranger.request(route.method, route.pattern.replace(/:\w+/g, '1'), route.method === 'GET' ? undefined : {});
  assert.ok([403, 404].includes(res.status), `${route.method} ${route.pattern} answered ${res.status}`);
}
```

Do not delete a route to make the loop pass, and do not put a write route
(`PATCH`, `DELETE`, `POST`) in the list.

**What the app's M07 test adds.** The core's M07 test already reads every
`.html` file in `public/`, including the app's, for the language, the
viewport line, a title, one main heading, a `main` landmark, a label for
every field, and no script or style written into the page; and `app.css`,
with the app's additions, for any width wider than a 320-pixel phone
(`tooWideForAPhone()` in `tests/helpers.js`). Do not copy it.
The app's test checks what only the app knows: every page a menu entry or a
link points to exists; every page loads its own script and that file exists;
every table has a caption and either `class="stack"` or a reason not to;
every button has a `type`; and for the keyboard: no
element has a `tabindex` above 0, and in each form the button that sends it
comes after its last field. These read files. They do not show that a page looks right, so say
in the report which screens you looked at, at which widths, and how.

Tests that send many wrong passwords from one place run into the sign-in
limit (five per account, twenty per address, in fifteen minutes). Clear it
between such tests: `t.db.prepare('DELETE FROM login_attempts').run()`.

Run `node tools/rubric.js --write` when you are done. It lists each
requirement with the number of app tests and core tests passing, and saves
the table as `RUBRIC-RESULTS.md`. It exits with an error while a mandatory
requirement has no passing app test. `RUBRIC-RESULTS.md` is part of what is
handed in: it goes to GitHub with the rest, so run the command again after
the last change.

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
- **The first account.** `node tools/add-user.js` asks for the email, name
  and role, and makes up a password if none is typed, showing it once. It
  works on every system and at any time. On Windows the owner double-clicks
  `add-account.cmd`, which runs the same thing. To run it yourself without
  anything being typed:
  `node tools/add-user.js --email ... --name "..." --role ... --generate`.
  Never pass a password on the command line and never write one into a file.
  (On a host, the first administrator comes from the `ADMIN_EMAIL` and
  `ADMIN_PASSWORD` settings instead, which only take effect while the
  database has no accounts at all.)
- **Who makes it.** When the owner is with you, make their account, tell them
  the password once in your reply, and leave `data/` in place for them. When
  they are not, or the folder will be handed to someone else (a marker, a
  colleague), hand it over with no `data/` folder. Then the quickest way for them to
  see the app working is the example data: `load-example-data.cmd`, then
  `start-app.cmd`, then sign in with an account it listed. For real use
  they start again without it: close the app, delete `data`, create their
  own account (`add-account.cmd`, or the command), start the app. Give
  both, in that order, in the hand-over. An app that arrives with accounts already in it arrives with
  passwords somebody else knows. The app helps with the order: while it
  has no accounts, the window it was started in says to create one, the
  sign-in page says the same, and creating an account on that page is
  refused (it would make an ordinary account with nobody to manage it).
  Starting the app a second time prints "probably running already" and the
  address, not an error.
- **Example data.** `tools/seed.js` is already written except for the app's
  own records: fill in `addExampleData()`. Make records with the app's own
  functions where it has them (`book()` from `modules/bookings.js`), not a
  bare `INSERT`: a booking inserted by hand leaves its slot looking free.
  A `tx()` inside those functions becomes part of the seed's own. The careful parts are done and
  tested: one account per role with passwords made up when it runs and shown
  once, a refusal to load twice, and a refusal on the live app unless asked.
  The owner runs it with `load-example-data.cmd` or `node tools/seed.js`.
  When the example needs two people of one kind (to show that one member
  cannot open another member's booking), list the second in
  `EXTRA_ACCOUNTS` at the top of that file: each entry becomes an account
  with its own made-up password, shown with the others, and reaches
  `addExampleData()` as `users.<key>`. Do not insert accounts by hand there:
  they would have no password anyone can use, and a core test checks for it.
  Make dates relative to the moment it runs, and count what you promise: if
  the hand-over says "slots for the next 14 days", load it in the evening and
  check that today is not empty and the fourteenth day is there. Example data
  is labelled as made up in the README.
- **Look at every screen** as each role, at phone width and desktop width:
  `node tools/look.js`. It needs Chrome or Edge on the computer and nothing
  else. It loads the example data into a throw-away copy, starts the app on
  a spare port, signs in as each example account, opens every page in the
  menu at 390 and 1280 pixels, and saves a picture of each in a folder
  outside the project (it prints where; `--out` chooses another, which must
  be new, empty, or one it made before: it never empties a folder of other
  files). It reports script errors, anything the security
  policy blocked, failed requests, pages that scroll sideways and the word
  "null" printed where a value was missing; then it signs out and presses
  Back, which must not show the last person's page again. Add
  `--page /classes/new` for a page no menu entry leads to. Then open the
  pictures and look: the tool cannot tell whether a screen looks right, and
  it presses nothing. It exits with 2 when there is no browser; say so in
  the report, and do not claim the screens were looked at. Both browser
  tools and the tests take spare ports; where programs must stay within a
  range, set `PORTS=3800-3899` first (PowerShell:
  `$env:PORTS='3800-3899'`). They clean up after themselves: the copy, the
  browser's profile, and the pictures of steps that failed last time.
  These, and the tests' throw-away databases, go in the computer's temp
  folder. To keep all of it inside one folder, set `TEMP` and `TMP` to it
  (`TMPDIR` on a Mac or Linux) before running; `look.js --out` moves only
  the pictures.
- **Click through the journey**: `node tools/journey.js`. The tests prove
  the routes; this proves the buttons are wired to them. It drives the same
  browser, on the same kind of throw-away copy, but types into fields,
  presses buttons and answers questions. Replace the starter's steps in
  that file with the journey from section 3 for each kind of user, one
  step per thing a person would notice, each ending with what they would
  see:

  ```js
  await app.step('A member books a place and is told so', async () => {
    await app.signIn('member');                        // member@example.com from the example data
    await app.go('/classes');
    await app.press('Book', { near: 'Beginners' });    // the button in the row or card that says "Beginners"
    await app.see('Booked.');
  });
  ```

  `fillIn('Label', value)` finds a field by its label, `press('Words')` a
  button or link by its words or its `aria-label` ("Approve Robin" on a
  button that shows "Approve"), `answer('Words')` a button in an open
  question, `see('text')` waits for text to appear. The choices inside a
  drop-down list are not text on the page for `see`, `notSee` and `near`,
  so a filter that lists every machine does not count as a row about one. When several rows say
  the same words, `{ near: '3D printer 2', nth: 1 }` is the top one. For
  two people at once, `const other = await app.asOther('member2')` signs in
  a second person without a screen; `await other.post(...)` takes the last
  slot, then the page's own attempt shows what the loser is told. The rest
  is listed at the top of `tools/browser.js`. Include at least one refusal the person
  would meet (the third booking, the form sent empty) and the sign-out. A
  failed step says why, shows what the page did say, and saves a picture.
  Report it as it was: "tools/journey.js went through N steps in a
  browser", or that there was no browser and the buttons were not pressed.
- Then try to break it by hand: a second tab, the address of someone
  else's record typed into the address bar.
- **Signing out on a shared computer.** The starter already stops the Back
  button from showing the last person's page: pages are never kept by the
  browser, and a page for signed-in people that comes back from the
  browser's memory is hidden and loaded afresh. That holds for every page
  whose script starts with `startPage()`. Keep both halves; `look.js`
  checks the result.
- Run the page check on the project folder as for a site
  (`python3 scripts/site_check.py`; on Windows the command is usually
  `python`). It reads `public/`. Stop the app when you are
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

An app's report has more to carry than a site's, so it has its own shape.
Keep every part; a part with nothing in it says so in one line. Plain words
throughout. Give the project folder's full path once, at the top, because
the owner has to find the files to double-click; after that, name files
without paths, and keep code paths (`modules/...`) out of the first half.

```
**[App name] is built and runs on your computer. It is not online yet.**
It is in this folder: [full path of the project folder]

**To see it**
1. [When you hand over without data: load the made-up example data
   (load-example-data.cmd, once); it lists an account for each role with
   its password, shown once.]
2. Start it: [double-click start-app.cmd / the command], and leave that
   window open.
3. Open [address] and sign in with [which account; a password only if you
   made it just now and are saying it this once].
[For real use: close it, delete the data folder, create your own account
with add-account.cmd, and start it again.]

**What it does**
[Three or four lines: each kind of user and what they can do. Then the main
journey in one sentence. If you mention the Activity screen, copy what it
lists from section 4 ("failed sign-ins, attempts to use a page or a record
that is not theirs, and bookings refused by a rule"); never "everything
the app refused": invalid input is not logged.]

**What was proven**
[The requirements, from tools/rubric.js, rewritten for the person: one row
for each requirement on their list, in their own wording, met or not, and
the number of this app's tests for it. Leave out the "core tests" column
and the rows for advanced requirements they did not ask for. M08 in its own
words: documented, not yet online.]
[N tests, all passing: the app's own and the ones that came with the
starter, as two numbers ("127: 48 for this app, 79 for the ready-made
parts"), the same numbers as in the table. They cover the cases listed in
RUBRIC.md, not everything; nobody has tried to break in on purpose.]
[Page check: N out of 100, with its verdict and why. A checklist of common
faults, not a judgement of the design. When the only thing between it and
"ready" is a yellow note waiting for the owner, say so in those words: "97,
'not yet', for one yellow note on the Machines page that waits for your slot
times". Which screens you looked at yourself, at which widths, and how:
"tools/look.js opened N screens as each role at 390 and 1280 pixels and
found nothing; I looked at the pictures of ...; tools/journey.js went
through N steps by clicking and typing", or that there was no browser and
nobody has looked or pressed anything.]

**What I assumed**
[Every rule or detail you were not given, one line each, for them to
confirm or change: slot lengths, opening hours, what cancelling does.]

**I need these from you**
[Real data, confirmations, anything still marked yellow.]

**What I left out**
[Things they might expect that are not there, and why.]

**What it costs to keep online**
[The host you would use, the monthly price to stay awake, the free plan and
its catch. One or two sentences, before they ask.]

**When you are happy with it**
[Publishing is theirs to start. Say "put it online" and I will give the
steps. What they will need: the accounts named in app-publish.md.]
```

Check every sentence of the report against what is in the folder before
sending it: the number of tests, the number of days of example data, the
names of the files to double-click, and what each screen shows (the
Activity screen lists what section 4 says, not "everything refused"). A report that promises fourteen days
where thirteen were made is the app-sized version of a wrong phone number.

If the owner is not there to ask, write the publishing steps from
`references/app-publish.md` into `site-notes.txt` with this app's real
names, and report M08 as documented, not yet online.

Do not say an app is secure. Say what was tested, and that an app holding
other people's data deserves a second look by someone who can read code
before it holds anything sensitive.

# The advanced requirements (A01 to A08)

Read the section for each advanced requirement the app is going to meet.
Build one only when the person asked for it or the app needs it; an offline
mode or a planner bolted onto an app that has no use for it is weight, and it
will show.

Each section has the same four parts: what it means for the person using the
app, what to build with (the starter's `core/` already has the hard part,
tested), what the screen must do, and the test. The test is fixed by the
requirement; write it on the app's own data, with the id at the start of its
name, in the module's test file. The starter's own "core A.." tests show the
pattern for each and are worth reading first.

## Contents

- A01 Real-time sync
- A02 Intelligent decisions and optimization
- A03 Advanced security and access control
- A04 Offline-first
- A05 Concurrency and transactions
- A06 External API and fault tolerance
- A07 Automated multi-step workflow
- A08 Advanced data processing and analytics

## A01 Real-time sync

*Test: two users update the same record at once.*

**Means.** When one person saves, the others looking at the same thing see
it change without reloading. When two people save the same record at the same
moment, one save goes through and the other person is told, shown what
changed, and asked what to do. Nobody's work is overwritten without their
knowing.

**Build with.** Two separate things, both needed:

- A `version` column on the record, and `updateVersioned()` from
  `core/records.js` for every edit. The page sends back the version it
  loaded; a save on an old version gets a 409 with the current record.
- `hub.publish()` from `core/realtime.js` after each change, and
  `connectLive()` from `public/js/live.js` in the page. Publish ids and
  versions, not whole records; the page fetches through the normal route, so
  the access rules still decide who sees what. `audience` is required: say
  who may hear about it.

**The screen.** On a live event for a record that is open and unedited,
refresh it and show briefly that it changed. If the person is in the middle
of editing it, do not replace what they typed: show a notice that it changed
and let them choose. On a 409, show their version next to the current one,
field by field where they differ, with "keep mine", "take theirs" and, when
it is text, a way to combine. After the connection drops and returns, reload
what is on screen (`onReconnect`), because events were missed.

**The app's test.** Two signed-in clients load the same record and send
different edits with the same version at the same moment (`Promise.all`).
Exactly one gets 200 and the other 409 with the current record; the stored
record is the winner's; a third client's event stream received the change;
a client who may not see the record received nothing.

**Mistakes to avoid.** "Last save wins" with a live update on top is not
conflict handling, it is a faster way to lose edits. Do not send record
contents over the event stream. Do not compare timestamps to detect
conflicts; clocks differ.

## A02 Intelligent decisions and optimization

*Test: conflicting constraints or an infeasible request.*

**Means.** The app works something out for the person that is tedious or
hard by hand: who covers which shift, which order goes on which van, the
cheapest way to meet the rules. When what they ask for cannot be done, it
says which rules are in the way. It does not produce a plan that quietly
breaks one, and it does not just say "error".

**Build with.** `solveAssignment()` from `core/solve.js`: give it the things
to place, the options, the rules as functions that answer true or a sentence
saying why not, and optionally a cost to minimise. It returns the best plan,
or the items that cannot be placed with the reasons. It is an exact search,
so the same input gives the same answer, and the answer can be checked by
hand. Write the rules from the owner's own sentences, one function each, so
the reasons read like the owner would say them.

If the problem is not an assignment (a route, a price, a ranking), write the
decision as a plain function with the same contract: an answer with its
reasoning, or a refusal with the rules that conflict.

Do not call an AI service to make the decision. It would need a secret key
and a paid account, it gives different answers to the same question, and it
cannot show that the rules were kept. "Intelligent" here means the app
reasons about the rules, and can explain itself.

**The screen.** Show the proposed plan with the cost or score that made it
best, and let the person accept it; saving happens only on accept, inside one
transaction. For a refusal, show the reasons as a list in plain sentences and
which rule the person could relax.

**The app's test.** A solvable case returns the best plan, checked against a
hand-worked answer. A request no option can satisfy is refused with every
reason. A request where each item fits alone but not all together is refused
as a conflict naming the rules. In both refusals, nothing was saved.

**Mistakes to avoid.** A greedy "first fit" that returns a plan while a
valid one exists but it cannot find it. A plan that is saved while still
breaking a rule. A search with no step limit on input the owner controls.

## A03 Advanced security and access control

*Test: a user tries to modify another user's restricted record.*

**Means.** A person can see and change only what the rules say is theirs.
Changing the number in the address, or sending a request by hand, gets them
nothing, and the attempt is on record.

**Build with.** `guardRecord()` from `core/policy.js` after every "load by
id", with one rules object per kind of record (`read` and `write` functions
of the user and the record). Lists are filtered by the same rule in the SQL
`where`, never by loading everything and hiding rows in the page. `check()`
already refuses fields that are not in the schema, which is what stops a
request from carrying `owner_id` or `role`. Refusals are written to
`audit_log`; give the administrator a screen that shows them.

In a route that changes a record, the order is: read the id, load the
record, `guardRecord()`, and only then read and check the body. Checking the
body first answers a stranger's malformed request with "your input is
wrong", which confirms the record exists and leaves no line in the log.

A record the user may not even see answers "not found", the same as one that
does not exist, so that numbers cannot be probed. A record they may see but
not change answers "not allowed".

**The screen.** Buttons for actions a person may not take are not shown. That
is for clarity only; the route decides.

**The app's test.** User B reads, edits and deletes user A's restricted record
by its id: 404 each time, the record unchanged, each attempt in the audit
log, and the record absent from B's list. A record B may see but not change
gives 403 on write. Sending `owner_id` or `role` in a request is refused.
A wrong user sending nonsense in the body gets the same 404, and is logged.
Then the loop that makes this hold for the whole app: for every route with
an id in it, a request from the wrong user is refused. Take the routes from
`t.app.routes` (each has `method`, `pattern` and `opts`; see section 7 of
`references/app.md`) and pick those whose `pattern` contains `:id`, so a
route added later is covered without anyone remembering to add it. A record
that every signed-in person may look at (a class, a machine) is not a
restricted record: name its read route in a short `shared` list at the top
of the test, with the reason, as section 7 of `references/app.md` shows.
Only `GET` routes belong there. Do not remove a route to make the loop
pass.

**Mistakes to avoid.** Checking the role and forgetting the ownership.
Filtering in the page. A second route to the same data (an export, a search,
a live event) that skips the rule.

## A04 Offline-first

*Test: conflicting edits while one client is offline.*

**Means.** The app opens and can be used without a connection: the person
sees what they last loaded, makes changes, and those are sent when the
connection returns. If someone else changed the same record in the meantime,
the person is asked; neither change disappears silently.

**Build with.** Three parts, all in `public/`:

- `sw.js` keeps the pages and scripts on the device. List the app's own
  files in `SHELL` and raise `VERSION` when any of them changes. It never
  stores `/api/` answers.
- `cache` from `js/offline.js` keeps the records the person has loaded, in
  the browser's own database, so there is something to show offline.
- `startOffline()` from `js/offline.js` gives `save()`, which sends at once
  when it can and otherwise queues the change in an outbox with the version
  it was based on. On reconnect the outbox is sent in order; a 409 calls your
  `onConflict`, where `threeWayMerge()` from `js/merge.js` sorts fields only
  one side changed (merged by themselves) from fields both changed (the
  person chooses).

The server side is A01's `updateVersioned()` plus `once()` on every route the
outbox can call, so that a change whose answer was lost is not applied twice
when it is sent again.

Decide which actions make sense offline and offer only those. Editing your
own notes does. Taking the last seat does not: it needs the server's answer,
so offline it is shown as "will be requested when you are back online", never
as done.

**The screen.** A visible state at all times: online, offline, or "3 changes
waiting to be sent". Queued changes are marked on the records they belong to.
A conflict shows both versions of the fields in question and asks. A change
the server refuses for another reason is reported to the person, not dropped
quietly.

**The app's test.** A client loads a record and goes offline; it edits the
record (queued, not sent). Another client changes the same record. The first
comes back online: the server answers 409, the conflict handler is called
with exactly the fields both sides changed, and after the choice the stored
record has the chosen values and a higher version. Fields only one side
changed are merged without asking. A queued create that is sent twice makes
one record. The starter's "core A04" tests do this with the outbox's memory
store; do the same with the app's own records and routes.

Service workers run only on https or localhost, so this cannot be seen by
opening a file, and it needs a real look in a browser as well: load the app,
switch the browser's network off in its developer tools, reload, edit,
switch it back on.

**Mistakes to avoid.** Caching `/api/` answers in the service worker (one
person's data shown to the next on a shared device). Resolving conflicts by
timestamp. Showing a queued action as finished.

## A05 Concurrency and transactions

*Test: multiple users request the last available resource.*

**Means.** When several people go for the last seat, room, ticket or unit of
stock at the same moment, exactly one gets it and the others are told at
once that it is gone. The count never goes below zero, and no action is ever
left half done.

**Build with.** `tx(db, fn)` from `core/db.js` around the whole action, and
`takeOne()` from `core/records.js` for the decrement: one statement that only
succeeds while something is left. Record who got it in the same transaction.
Back it with the table itself: `CHECK (remaining >= 0)` and a `UNIQUE` rule
where one person may hold only one. Nothing is awaited inside `tx` (it
refuses a function that returns a promise): read the request before, notify
after.

When each thing can be held by one person only (one slot, one person),
`remaining` is simply 0 or 1. Keep `takeOne()`, write the rule as
`CHECK (remaining IN (0, 1))`, and add the table's own version of "never two
people in one slot":
`CREATE UNIQUE INDEX one_booking_per_slot ON bookings(slot_id) WHERE status = 'booked';`

Giving it back (a cancellation) is the mirror image, `giveBack()` from the
same file, also in one transaction, and only if the booking was still
active, so that cancelling twice does not free two seats:

```js
tx(db, () => {
  const done = db.prepare("UPDATE bookings SET status = 'cancelled' WHERE id = ? AND status = 'booked'").run(id);
  if (done.changes === 1) giveBack(db, 'classes', booking.class_id);
});
```

Both helpers find the row by `id`. For a table keyed by something else (a
credit balance keyed by `user_id`), pass `{ key: 'user_id' }` as the last
argument: `takeOne(db, 'balances', user.id, 'credits', 1, { key: 'user_id' })`.

**The screen.** The loser sees a clear sentence and the list refreshes to
show nothing left. With A01 in place, everyone watching sees the count drop
live.

**The app's test.** Twenty signed-in clients request the last one in the same
instant (`Promise.all`): one 201, nineteen 409, `remaining` is 0, exactly one
booking row. A booking that fails in a later step of the same transaction
leaves `remaining` as it was. Cancelling twice frees one place.

To make that later step fail when the app gives it no natural reason to
(every rule is checked before `takeOne`, so the insert after it always
works), break it from the test with a trigger, and remove the trigger
afterwards. No code in the app changes:

```js
t.db.exec("CREATE TRIGGER t_refuse BEFORE INSERT ON bookings BEGIN SELECT RAISE(ABORT, 'test: insert refused'); END");
const res = await member.post('/api/bookings', { slot_id });
t.db.exec('DROP TRIGGER t_refuse');
assert.equal(res.status, 500);
assert.equal(t.db.prepare('SELECT remaining FROM slots WHERE id = ?').get(slot_id).remaining, 1);   // given back
```

Then check that the test can fail. A race inside one program can pass with
no protection at all, because the requests never truly overlap. Do this in a
scratch copy of the project, never in the owner's folder: an interrupted run
there leaves the app unprotected. The protection has layers, so take them
out in this order and run the test after each:

1. Replace `takeOne()` with a plain `UPDATE ... SET remaining = remaining - 1`.
   The test must fail. (The table's `CHECK` now stops the extra requests, but
   with an error instead of "the last one has just been taken", so the count
   of 409 answers is wrong.)
2. Also remove the `CHECK` and the `UNIQUE` rule or index from the copy's
   migration. Now there must be several winners, or a count below zero.

If the test is still green after step 2, it proves nothing; fix the test.
One thing that does *not* make it fail, and should not be mistaken for a
broken test: moving "read the count, decide in code, write it back" inside
`tx()`. `tx()` takes the database's write lock before it reads, so that
version happens to be safe. It is still the wrong habit, because the same
code outside `tx()`, or with an `await` between the read and the write, is
the classic double booking.

The starter's "four separate programs" test shows the stronger form, where
the requests really do run at the same moment; copy it when the result
matters. Copy its `runAll()` (from `tests/helpers.js`) with it, not a bare
`Promise.all`: `Promise.all` gives up when the first program fails while
the others still have the database open, the clean-up then fails too
(Windows will not delete a file that is in use), and the report shows the
clean-up's error where the real one should be. `runAll()` waits for every
program and hands back each result or error; assert on them afterwards.

Do not weaken the database's own rules to make a test pass: the `CHECK` and
`UNIQUE` rules are the last line that holds when code is wrong.

**Mistakes to avoid.** Reading the count, deciding in code, then writing: two
requests both read "1". Doing the decrement and the booking in separate
transactions. Trusting that "the database is fast" instead of the one
conditional statement.

## A06 External API and fault tolerance

*Test: the API times out or returns malformed data.*

**Means.** The app uses a service on the internet (weather, maps, exchange
rates, a delivery quote), and keeps working when that service is slow, down
or answering nonsense. The person is told the figure is out of date or
unavailable; the page does not hang and the app does not crash.

**Build with.** `callExternal()` from `core/external.js`, always from the
server, never from the page (the key would be public, and the page could not
be trusted with the answer). It applies a time limit, retries what is safe to
retry, refuses answers that are not valid JSON or do not pass your `validate`
function, stops asking for a while after repeated failures, and returns
`{ ok, value, source, error }` instead of throwing. Write `validate` to check
every field the app will use, with its type and a sane range.

Keep the last good answer in a table with the time it was fetched, and use it
as the `fallback`. Decide per use what is honest when there is no good
answer: a stale value clearly marked as such, or "not available right now";
never a made-up default presented as real.

The service's key comes from the environment. Name it in `.env.example`
without a value, and list "open an account at ... and add the key on the
host" under "I need these from you". Until the owner has done that, the
feature runs on the fallback path and says so.

**The screen.** Shows where a figure came from when it is not live ("rate
from 14:05, the service is not answering"). An action that cannot proceed
without the service says so and offers to try again.

**The app's test.** Start a small fake service inside the test
(`http.createServer`, as the starter's "core A06" tests do) and point the app
at it. When it answers slowly: the route still answers within the limit, with
the stored value marked as not live. When it answers with garbage, or with
valid JSON of the wrong shape: the same. When it recovers: the live value is
used again. Throughout, `/api/health` answers and nothing is logged as a
crash.

**Mistakes to avoid.** A `fetch` with no time limit. Passing the service's
answer to the page or the database without checking it. Retrying a request
that changes something on the other side. Testing only against the real
service, which is up on the day of the test.

## A07 Automated multi-step workflow

*Test: a middle step fails after earlier ones succeeded.*

**Means.** One action by a person sets off several steps that the app carries
out by itself (reserve, charge, confirm, notify). If a later step fails after
earlier ones have happened, the earlier ones are undone and the person is
told what happened. Nothing is left reserved but unpaid, or paid but not
confirmed.

**Build with.** `defineWorkflow()` and `runWorkflow()` from
`core/workflow.js`. Each step has `run` and, unless it is the last, `undo`.
Every step's progress is stored as it happens. When a step fails, completed
steps are undone in reverse order and the run ends as `compensated`; if an
undo itself fails it ends as `needs_attention`, which an administrator must
be able to see and act on. Add the definition to `workflows` in
`modules/index.js`, so that runs cut off by a restart are picked up when the
app starts.

Steps that are all inside the app's own database belong in one `tx`, not in
a workflow: the database undoes those for free. A workflow is for steps that
cannot share a transaction, because they wait (an outside service) or take
time.

Write each `run` so that doing it twice does no harm, and pass a `runKey` so
that starting the same job twice returns the first run.

**The screen.** The person sees the job's state in words (in progress, done,
could not be completed and why, what was undone). The administrator has a
list of runs with their steps, and of runs needing attention.

**The app's test.** Make the middle step fail (inject a failing dependency,
as in the starter's "core A07" tests): the run ends `compensated`, the first
step's effect is gone from the database, the later steps never ran, and the
person's view says what happened. A step that fails twice and then works is
retried and the run completes. Starting the same job twice with one key runs
it once. A run left "running" by a restart is finished on the next start.

**Mistakes to avoid.** A chain of calls with a `try/catch` that logs and
moves on. Undo steps that were never run in a test. No way to see a job that
is stuck.

## A08 Advanced data processing and analytics

*Test: duplicates, missing values, large volumes.*

**Means.** The app takes in data in bulk (a spreadsheet export, a log) and
turns it into figures a person can act on: totals, trends, comparisons. Real
files have the same row twice, empty cells and a hundred thousand lines; the
app deals with all three and says what it did.

**Build with.** `importCsv()` from `core/csv.js` for the intake: it reads row
by row, checks required columns, cleans each row with your function, drops
repeats by the key you name, fills or rejects empty cells as you decide, and
saves in batches. It returns a report (rows read, imported, duplicates,
incomplete, invalid, with line numbers for a sample), which the person must
see. Decide and state what a duplicate of something already stored means:
skipped, or updated.

Let the database do the arithmetic: `GROUP BY`, `SUM`, `AVG`, `COUNT` over
indexed columns, with `listQuery()` for the table underneath. `AVG` and
`COUNT(column)` leave out missing values, which is what you want: a missing
value is not a zero. Say how many were missing next to any average.
`stats.summarize()` does the same for a list in code.

Uploads arrive as text through `ctx.text()` (5 MB by default); state the
limit on the screen. Charts, if any, are drawn with plain SVG from the
figures; no chart library is needed for bars and lines, and each chart has
the same figures as a table for people who cannot see it.

**The screen.** After an import: the report, in sentences ("1,204 rows read,
1,150 imported, 31 were repeats, 23 had no amount; download the 54 that were
left out"). On the figures: the period and filters in force, how many records
the figure is based on, and how many were left out for missing values.

**The app's test.** A small file with a repeated row, a row with an empty
required cell, a row with an invalid value, an empty optional cell and a
quoted cell containing a comma: the report counts each correctly and the
table holds exactly the right rows. A generated file of 100,000 rows with
known duplicates imports within a time limit you set, in batches, and the
totals from the app's analytics route equal totals computed independently in
the test. A figure over data with missing values equals the hand-computed
figure that ignores them.

**Mistakes to avoid.** Splitting lines on commas (quoted cells break it).
Loading the whole file into one array of objects, or computing totals in the
page from a single page of results. Treating an empty cell as zero. An import
that reports "done" with no counts.

# [[FILL IN: the app's name]]

[[FILL IN: three sentences. What this app is, who uses it, and what they get done with it.]]

## Run it

You need Node.js 22.13 or newer (nodejs.org, the LTS installer). Nothing else is installed.

| | Windows: double-click | Any system: in a terminal opened in this folder |
|---|---|---|
| Create an account (do this first) | `add-account.cmd` | `node tools/add-user.js` |
| Start the app | `start-app.cmd` | `node server.js` |
| Load made-up example data, once | `load-example-data.cmd` | `node tools/seed.js` |

Creating an account asks for an email, a name and a role. Press Enter at the
password question and one is made up and shown once; write it down, then
change it under **Your account** after signing in.

When the app has started it prints its address, normally http://localhost:3000.
Open that in a browser. Leave the window open while you use the app; close it
(or press Ctrl+C) to stop the app.

## Who can do what

[[FILL IN: one line per role. What each kind of user can see and do, and how to
get an account for each (who creates it, or the example data above). No passwords here.]]

## How it is built

One Node.js program with its database in one file (`data/app.db`). No packages.

[[FILL IN: one line per module, saying what it holds and which other modules it
depends on. Then the main journey that crosses them, as a numbered list.]]

## The rules

See [RULES.md](RULES.md).

## How it is tested

```sh
node --test                    # every test
node tools/rubric.js --write   # the tests, counted against each requirement
node tools/look.js             # every screen as each role, in a browser without a window (needs Chrome or Edge)
node tools/journey.js          # the main journey, clicked and typed in the same browser
```

The tests and both browser tools take spare ports. To keep them within a
range, set `PORTS=3800-3899` first (Windows PowerShell: `$env:PORTS='3800-3899'`).

[[FILL IN: the result of the last run, with its date, and what the tests do not cover.]]
[RUBRIC.md](RUBRIC.md) says where each requirement is met and how to see it.

## Where it is online

[[FILL IN: the address and the host, or "Not published yet."]]

## What it does not do

[[FILL IN: the things someone might expect that are deliberately left out.]]

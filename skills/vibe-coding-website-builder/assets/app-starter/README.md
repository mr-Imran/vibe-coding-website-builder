# APP NAME

REPLACE: three sentences. What this app is, who uses it, and what they get done with it.

## Run it

You need Node.js 22.13 or newer (nodejs.org, the LTS installer). Nothing else is installed.

```sh
node server.js
```

Then open http://localhost:3000. The first time, start it with an administrator
account to create:

```sh
ADMIN_EMAIL=you@your-address ADMIN_PASSWORD="a long password you choose" node server.js
```

## Who can do what

REPLACE: one line per role. What each kind of user can see and do, and how to
get an account for each (who creates it, or the seed command). No passwords here.

## How it is built

One Node.js program with its database in one file (`data/app.db`). No packages.

REPLACE: one line per module, saying what it holds and which other modules it
depends on. Then the main journey that crosses them, as a numbered list.

## The rules

See [RULES.md](RULES.md).

## How it is tested

```sh
node --test                    # every test
node tools/rubric.js --write   # the tests, counted against each requirement
```

REPLACE: the result of the last run, with its date, and what the tests do not cover.
[RUBRIC.md](RUBRIC.md) says where each requirement is met and how to see it.

## Where it is online

REPLACE: the address and the host, or "Not published yet."

## What it does not do

REPLACE: the things someone might expect that are deliberately left out.

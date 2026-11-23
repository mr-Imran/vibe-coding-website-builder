# Contributing

Thanks for looking. The skill has two halves. For simple sites: guides, a
page skeleton and one Python script that uses only the standard library. For
apps: guides and a starter kit, which is one Node.js program with no packages.

## Layout

```
skills/vibe-coding-website-builder/
  SKILL.md        the workflow the agent follows
  references/     guides loaded only when a step needs them
  scripts/        site_check.py
  assets/         page-skeleton.html
                  app-starter/   the starting point for every app (see below)
  evals/          test cases: a prompt, input files and graders for each
tests/            unit tests for site_check.py
docs/             the landing page, served by GitHub Pages; plain HTML and CSS
assets/           the README demo (demo.json is its recorded output) and the social preview
```

The landing page is held to the skill's own standard. After changing it, run
the check on it and keep it at 100:

```sh
python3 skills/vibe-coding-website-builder/scripts/site_check.py docs
```

## Try a change

The check runs on its own, so most changes can be tried without an agent:

```sh
python3 skills/vibe-coding-website-builder/scripts/site_check.py skills/vibe-coding-website-builder/evals/publish-and-connect-form/files
python3 -m unittest discover tests
```

Keep the script free of third-party imports and working on Python 3.8.

## The app starter

`skills/vibe-coding-website-builder/assets/app-starter/` is copied into every
app the skill builds, so a mistake in it is a mistake in all of them.

```sh
cd skills/vibe-coding-website-builder/assets/app-starter
node --test                 # every test must pass
node tools/rubric.js        # the tests, counted against M01 to A08
```

- It needs Node.js 22.13 or newer and has no dependencies. Keep it that way:
  no `npm install`, no build step.
- `core/` holds the parts that are easy to get wrong (sign-in, sessions,
  access rules, transactions, retries). Every helper there has a test named
  `core <id> ...` for the requirement it serves. A change to a helper comes
  with a change to its test, and a new helper comes with a new one.
- Comments in `core/` say why the code is the way it is, for an agent that
  will build on it. Keep them accurate when the code changes.
- Do not add an example module. Apps are built from the guides; an example
  left in the starter ends up in every app.
- After changing the starter, re-read `references/app.md` and
  `references/app-advanced.md`: they name its files and functions.
- Nothing in the starter may name a role. The app's builder renames the roles
  in `config.js`; pages use `'top'` for the first one, and the core's tests
  bring their own.
- The `.cmd` files are for people who do not use a terminal. They keep
  Windows line endings (`.gitattributes` stops git from changing them), and
  a test checks that.
- The unit tests for the check set `sys.dont_write_bytecode`, so running them
  leaves no `__pycache__` in the skill folder, which is copied whole when the
  skill is installed.

## Changing the check

Every check has an id, a point value and a title in `CHECKS`, and belongs to a
fix group in `FIX_GROUPS` in `scripts/site_check.py`. If you add or re-weight a
check:

- Keep the six areas adding up to 100.
- Write its title and messages for someone who cannot read code: say what a
  visitor would see go wrong.
- Add a test in `tests/test_site_check.py` for the fault, and one for the
  nearest thing that is not a fault.
- Mirror it in `references/checklist.md`, which is the same list for machines
  without Python.

A check should fail only on something that is really wrong. A false alarm
costs more here than in most tools, because the person reading the report
cannot tell that it is one.

Never put a real key, or text shaped like one, in the repository. The tests and
the test cases assemble their fake keys at run time for that reason.

## Facts that go stale

`references/addons.md` and `references/publish.md` carry free-plan limits,
prices and menu names for hosting, form and payment services, each marked with
the date it was checked. When you update one, check it against the service's
own page and update the date.

## Running the evals

Each folder under `skills/vibe-coding-website-builder/evals/` is one test case. With Claude Code
2.1.269 or later, from `skills/vibe-coding-website-builder/`:

```sh
claude plugin eval . --scaffold --allow-tools Write,Edit,Bash
```

These are real, billed model runs. Results land in `evals/results/`, which is
ignored by git.

When you run a case by hand instead (give an agent the prompt and the path of
the skill), point the agent at a copy of the skill folder with `evals/` left
out. The graders' file names alone say what is being marked, and an agent
that lists the skill folder sees them. Ask the run for a list of everything
in the skill that was wrong, unclear or worked around: that list has been
worth more than the score.

## Reporting a problem

Open an issue with the site folder you ran it on (or a small copy that shows
the problem, with any real keys removed), the check's output, and what you
expected instead.

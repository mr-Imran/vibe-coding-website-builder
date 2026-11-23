# Contributing

Thanks for looking. The skill is small on purpose: one `SKILL.md`, four
reference files, a page skeleton and one Python script that uses only the
standard library.

## Layout

```
skills/vibe-coding-website-builder/
  SKILL.md        the workflow the agent follows
  references/     guides loaded only when a step needs them
  scripts/        site_check.py
  assets/         page-skeleton.html
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

## Reporting a problem

Open an issue with the site folder you ran it on (or a small copy that shows
the problem, with any real keys removed), the check's output, and what you
expected instead.

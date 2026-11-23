# vibe-coding-website-builder

A website builder skill for vibe coding: build, check and publish a simple website with AI, without writing code.

It is an agent skill for Claude Code and other AI coding agents. It builds a simple site from a plain description, scores any AI-built site from 0 to 100 on whether it is ready to publish, and walks the owner through putting it online for free.

<p align="center">
  <img src="assets/demo.svg" alt="The site check run on a test site that an AI built in a weekend: 39 out of 100, verdict DO NOT PUBLISH. The list of fixes starts with a secret key left in the page, then titles and sharing, broken links and pictures, phone layout, placeholder text and a form that sends nothing." width="738">
</p>

Website: [mr-imran.github.io/vibe-coding-website-builder](https://mr-imran.github.io/vibe-coding-website-builder/)

## Install

```sh
npx skills add mr-Imran/vibe-coding-website-builder
```

That uses the [skills CLI](https://github.com/vercel-labs/skills), which installs into Claude Code, Codex, Cursor, OpenCode and other agents that read `SKILL.md`. The bundled check needs Python 3.8 or newer and nothing else; without Python the agent works through the same checklist by hand.

Claude Code can also install it as a plugin:

```sh
claude plugin marketplace add mr-Imran/vibe-coding-website-builder
claude plugin install vibe-coding-website-builder@vibe-coding-website-builder
```

Then open an empty folder and say what you want:

```text
I want a website for my cake business. I don't know anything about coding.
```

## What it does

| You say | What you get |
|---|---|
| "Make me a website for..." | A site made of plain files, with no tools to install, that opens by double-clicking `index.html`. Built around the one thing a visitor should do: call, write, book or buy. |
| "Is my site OK to publish?" | A score out of 100 and a list of what to fix, most important first, described by what a visitor would see go wrong. Nothing is changed unless you ask. |
| "Add a contact form / payment / booking" | The steps to open an account with a hosted service, and the page wired to the link it gives you. No key that should stay secret ever goes in the page. |
| "How do I put it online?" | One recommended free host with its catch, and numbered steps for your browser. |

Whatever only you know (your opening hours, your prices, your photos) is marked on the page with a bright yellow note instead of being made up. You see the gaps in the browser, answer them in chat, and the check counts every note that is left.

## The score

| Area | Points | What is checked |
|---|---|---|
| Safe to publish | 30 | No secret keys in the files, no private files in the folder that goes online, no pretend password protection, nothing sent over an insecure address |
| Everything works | 25 | A home page called `index.html`, every linked picture and page exists with the exact same capital letters, no addresses that only work on your computer, no dead buttons, every form really sends |
| Fits a phone | 10 | The line that tells phones to fit the page, a layout that adapts, nothing fixed wider than a phone |
| Real content | 15 | No placeholder text or pictures, no open yellow notes, no leftover default titles, a way for visitors to act |
| Found and shared | 12 | A title and description for search results, a browser-tab icon, a title and picture for shared links |
| Easy and fast | 8 | Picture descriptions, form labels, zoom allowed, no heavy pictures |

The verdict is one of three: **ready**, **not yet**, or **do not publish** (a secret key, a private file or a pretend password was found).

The score is a checklist of common faults in the files. It does not judge the design, and it cannot tell whether visitors will come. Reviews, customer numbers and similar claims are listed for the owner to confirm, because only they know whether those are true.

## Use the check without an agent

It is one file that uses only the Python standard library. It reads the folder; it runs nothing, sends nothing and changes nothing.

```sh
# Score a site folder. --summary for a few lines, --json for tooling, --min 80 to fail a CI job.
python3 skills/vibe-coding-website-builder/scripts/site_check.py /path/to/site
```

## What it will not do

- Invent reviews, customer numbers, prices, opening hours or team members.
- Put a secret key or a password in a page.
- Create accounts, publish, buy a domain or pay for anything. Those are your clicks, with its steps beside you.
- Say a site is online before it has seen the address.
- Build log-in, a shop with a basket, or anything else that needs a server. It says so and links the simple site to a hosted service that does it properly.
- Promise visitors or a place in search results.

## How it was tested

Three test cases live in [`skills/vibe-coding-website-builder/evals`](skills/vibe-coding-website-builder/evals). Each was run once with the skill and once without, by the same model (Claude Fable 5.2), and graded by a separate agent against the assertions in each case's `graders/` folder.

| Test case | With the skill | Without |
|---|---|---|
| "I want a website for my cake business, I don't know anything about coding" | 12 of 12 | 10 of 12 |
| "I built this with ChatGPT, is it OK to publish? Don't change anything" (a site with a leaked payment key) | 12 of 12 | 11 of 12 |
| "How do I get it on the internet? And the contact form sends nothing" | 10 of 10 | 9 of 10 |

Read these with some care:

- It is one run per cell, and the assertions were written by the skill's author.
- The agent is capable without the skill. On its own it built a plain site with no build step, invented nothing, found the leaked key and said to replace it, and fixed the picture whose file name differed by a capital letter. Most assertions pass either way.
- What the runs without the skill left out: an overall score, stand-ins that say which photo is wanted (it wrote "Photo coming soon"), and that buying your own address is optional. The grader noted that three of the four failures depend on how strictly an assertion is read.
- Not counted in the table: the runs with the skill marked every gap with a yellow note and left a `site-notes.txt` for the owner. One of them also moved an existing site into a new folder without being asked; the skill now says to leave an existing site where it is, and that change has not been re-run.
- The skill costs more: about 20% more tokens on average across the three cases.

## Limitations

- Tested with Claude Code only. It is a plain `SKILL.md` with one Python script, so other agents should work, but nobody has checked yet.
- The check reads HTML, CSS and JavaScript with simple rules. It does not open the page in a browser, so it cannot see a layout that overlaps or a colour that is hard to read. It will sometimes be wrong; open an issue with an example.
- Its placeholder and claim patterns are tuned for English.
- For projects that need a build step, it checks the built folder if there is one and otherwise only looks for secrets.
- The guides name hosting, form and payment services with their free limits as checked on 2026-11-23. Those change; the skill tells the agent to confirm them on the service's own page.

## Related projects

- [Claude SEO](https://github.com/AgriciDaniel/claude-seo) by Agrici Daniel (MIT): a free SEO audit plugin for Claude Code. This skill only covers the SEO basics of a new site (title, description, share picture, one main heading). When your site is online and you want a full audit of technical SEO, content, structured data and AI search, use Claude SEO. It is a separate project; none of its code is included here.
- [launch-kit](https://github.com/mr-Imran/launch-kit), from the same author as this skill: gets a GitHub repository ready to launch and scores it from 0 to 100.

## Contributing

[CONTRIBUTING.md](CONTRIBUTING.md) explains the layout, how to try a change and how to run the test cases. The check has its own tests:

```sh
python3 -m unittest discover tests
```

## License

[MIT](LICENSE)

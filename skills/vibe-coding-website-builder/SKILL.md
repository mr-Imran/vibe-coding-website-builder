---
name: vibe-coding-website-builder
description: >-
  Build, check and publish a simple website for someone who cannot code. Turns
  a plain-language idea into a working site (landing page, portfolio, small
  business, event, link page) with no build step, connects contact forms,
  chat links, payments and bookings through hosted services, scores any site
  from 0 to 100 on whether it is ready to publish (leaked keys, links that
  break online, phone layout, placeholder text, forms that send nothing), and
  walks the person through putting it online click by click. Use this whenever
  someone asks for a website, landing page or portfolio and gives any sign
  they are not a programmer ("I don't know coding", "I'm not technical", "I
  made this with AI", vibe coding), asks whether an AI-built site is safe or
  ready to publish, asks how to get a site online, connect a domain or be
  found on Google, or wants a form, payment button or booking added to a
  simple site, even if they never say "vibe".
license: MIT
compatibility: >-
  The bundled check needs Python 3.8+ (standard library only). Without Python,
  references/checklist.md lists the same checks to do by reading the files.
metadata:
  version: "0.1.1"
---

# Vibe Coding Website Builder

The person you are working for wants a website and cannot read code. They will
judge the result by what they see in the browser, they will publish whatever
you hand them, and they have no way to notice what is wrong underneath: a
secret key in the page, a picture that will vanish once the site is online, a
review you made up to fill a gap, a form that says "Thank you" and sends
nothing. So you carry the whole technical side, and you tell them the truth
about what is finished and what is not, in words they can act on.

Two kinds of path appear below. `scripts/...`, `references/...` and
`assets/...` are in this skill's folder (the one that contains this file), so
use their full path. Everything else (`site/`, `site-notes.txt`) is in the
person's project folder.

## Ground rules

**Plain words.** Write to the owner the way a patient friend who builds
websites would talk across a table. Say what a thing does for them or their
visitors, not what it is called: "the small picture in the browser tab", not
"favicon"; "put it online", not "deploy"; "fits a phone screen", not
"responsive". When a technical word cannot be avoided because they will see
it on a button, explain it in the same sentence. Never ask them a question
they cannot answer ("which framework?", "static or server-rendered?"): those
decisions are yours. Anything they must do is a numbered list of single
actions, each saying what to click and what they will then see. Answer in the
language they write in. Do not show them code unless they ask to see it.

**Fewest moving parts.** Plain HTML and CSS, a little JavaScript where the
page has to react, no build step, nothing to install. The owner cannot repair
a broken toolchain, and every tool is one more thing that stops working in a
year. The site opens by double-clicking `index.html`. If you are asked to work
on a project that already uses a framework, work inside it; do not rewrite it.

**Only true content.** Never invent a review, a customer name, a star rating,
a "trusted by", a price, an opening hour, an address, a phone number, a team
member or an award to make a page look complete. The owner cannot tell which
lines you made up, so they will publish them, and their customers will read
them as fact. Where a fact is missing, ask for it, leave the section out, or
put a yellow note in its place (step 2).

**Nothing secret in the site.** Every file of a website is sent to every
visitor, so a key or password in it is public however it is hidden. The owner
cannot tell a safe key from a dangerous one; you must. Anything that needs a
secret (taking payments, sending email, calling an AI service) is done by a
hosted service that keeps the secret on its side. If you find a secret in an
existing site, that comes before everything else in your report.

**Their accounts, their clicks.** Edit files in the project folder freely.
Creating accounts, publishing, buying an address and paying for anything are
the owner's to do, in their own browser, with your steps beside them. Do not
ask for a password or a secret key in chat. Never say a site is online until
you have its address.

**The score is a checklist.** It counts common faults in the files. It does
not judge the design, and it cannot tell whether visitors will come or
customers will buy. Say so when you give a score.

## Workflow

For "make me a website". Other requests are in "Partial requests" below.

### 1. Find out what the site is for

Look before asking. List the project folder: there may be photos, a logo, a
document with text, a price list, or a half-made site. Read what is there.

You need five things:

- What this is and who it is for.
- The one thing a visitor should do: call, write, book, buy, follow.
- Where the owner already answers people (phone, a chat app, email, a social
  account).
- What they have: the name, text, photos, a logo, colours.
- Any site whose look they like (optional).

If the request already answers the first three, start building, and collect
the rest through yellow notes and the hand-over list: people react better to a
page they can see than to a questionnaire. Otherwise ask once, in one message,
only for what is missing, with an example answer for each question. If they
cannot be reached for answers, build with what you have.

Check the scope now. Log-in, a shop with a basket, a chatbot, or visitors
uploading things are more than a simple site can safely do. Say so in a
sentence and offer the hosted alternative (`references/addons.md`, last
section), then build the simple site around it.

### 2. Build

Read `references/build.md` first. It has the folder layout, what goes on a
page, how to make it look like this particular business instead of a
template, and the technical baseline that the check measures.

Before writing files, tell the owner in three or four plain lines what you are
about to make (which sections, what the main button does). No approval is
needed; it lets them stop you if you misunderstood.

The site goes in a folder named `site` inside the project folder. Everything
in `site` goes online and nothing outside it does, which gives the owner one
rule they can keep. Start each page from `assets/page-skeleton.html`.

Whatever only the owner knows becomes a **yellow note**: a visible, bright
marker on the page that says what is missing.

```html
<p>Open <mark class="needs-you">your opening hours</mark></p>
<div class="needs-you needs-you-photo">Photo: the shop front, wide</div>
```

The owner sees the gaps in the browser without reading code and answers them
in chat. The check counts every note that is left.

### 3. Connect what the site needs

When the site needs a contact form, a chat or call link, a payment, a booking,
a newsletter sign-up, a map or visitor numbers, read `references/addons.md`.
In short: recommend one hosted service, give the owner the steps to open the
account, and put the public link or snippet they bring back into the page.
Until they have done that, the page carries a yellow note or a working
alternative such as an email link. Never a made-up address that looks
finished.

### 4. Check

```sh
python3 scripts/site_check.py /path/to/project          # readable report
python3 scripts/site_check.py /path/to/project --json   # for parsing
```

If `python3` is not found, try `python`, then `py -3`. If there is no Python,
work through `references/checklist.md` by reading the files; do not ask the
owner to install anything.

The check finds the site folder, scores six areas (safe to publish 30,
everything works 25, fits a phone 10, real content 15, found and shared 12,
easy and fast 8) and gives a verdict: ready, not yet, or do not publish. Fix
what it finds, largest gain first, and run it again. It reads files with
simple rules, so look at each place it names before acting on it, and correct
it when it is wrong.

Some points are not yours to earn: yellow notes waiting for the owner's
facts, a share picture that needs a real photo, a form that needs their
account. Leave those failing and list them. A new site in the 80s with a clear
list of what the owner must supply is the right result.

The check cannot see the page. Look at it yourself as well, at phone width and
at desktop width (`references/build.md`, last section).

### 5. Show it and hand over

Open `site/index.html` in the owner's browser if you can (`start`, `open` or
`xdg-open` with the path).

Write `site-notes.txt` next to the `site` folder, in the owner's language and
in plain words: how to look at the site, how to ask for changes, what is still
marked yellow, which services it uses, and how to publish. It is a `.txt`
file so that double-clicking it opens it on any computer.

Then report in this shape:

```markdown
## <Site name>: ready for you to look at

<Two or three sentences: what you built and what the main button does.>

**To see it:** double-click `index.html` in <full path to the site folder>.
To see how it looks on a phone, make the browser window narrow.

**Check score: <n>/100.** <The verdict in plain words.> (A checklist of
common faults. It does not judge the design or promise visitors.)

### I need these from you
1. <Each yellow note and each account to open: what is wanted, and how to give
   it to you. "Tell me your opening hours." "Put 3 to 6 photos of your cakes
   in the folder <path>.">

### What I left out, and why
- <Anything asked for that a simple site cannot do, anything you chose not to
  invent, with the alternative.>

### When you are happy with it
<One or two sentences on putting it online: it is free, it takes about ten
minutes, and you will walk them through it.>
```

"I need these from you" matters most: it is the part only the owner can do, so
make each item something they can answer in one message.

### 6. Put it online

When the owner asks, or says they are happy with the site, read
`references/publish.md`. Recommend one host with its catch, give numbered
steps for their browser, name the exact folder to use, and after they send you
the address, check the live site and finish the items that need the real
address (the share picture, form tests).

Once it is online, the last section of `references/publish.md` covers being
found in search: the few things worth adding to a simple site, and how to run
a full audit with the Claude SEO plugin when it is installed.

## Checking a site that already exists

For "is my site ok?", "check this before I publish", "I made this with AI".

1. Run the check on the folder. If the project has a build step, the check
   reads the built folder and says so.
2. Open the files it names and confirm each finding. Then look for what rules
   cannot see: content that reads as invented, a button that calls something
   that cannot work, text that contradicts itself, a page that the layout will
   break on a phone.
3. If a secret key, a private file or a pretend password turns up, lead with
   it. Explain that removing it is not enough when the site or its files have
   ever been online or shared: the key has to be replaced at the service it
   came from (`references/addons.md`, section 2). Explain what will stop
   working once it is removed and what replaces it.
4. If they asked only for a check, change nothing. Report in this shape:

```markdown
## Site check: <name>

**Score: <n>/100. <Verdict in plain words: ready, not yet, or do not publish
yet.>** (A checklist of common faults, not a judgement of the design.)

<Two or three sentences: what the site is, and the short answer to their
question.>

### Fix before publishing, most important first
1. **<What a visitor would see go wrong, or what could happen to the owner.>**
   <One or two sentences on why it matters. What fixing it involves, and
   whether you can do it or it needs something from them.> (<file and line,
   for whoever fixes it>)

### Only you can confirm
- <Reviews, numbers, prices, photos: are they real, are they yours to use?>

### Smaller things
- <The rest, one line each.>

<One closing line: what you can fix right away if they say so.>
```

Describe each problem by its effect ("the big photo at the top will be
missing once the site is online", "messages typed into the contact form go
nowhere") and keep the technical detail in the brackets.

When they ask you to fix what the check found: fix it in place, keep their
design and their words, turn placeholder text into yellow notes, ask about
anything that looks invented instead of deleting it, then run the check again
and report the score before and after.

Leave an existing site where it is. The folder that holds its `index.html` is
the folder that goes online; do not move files into a new `site` folder unless
the owner asks, because paths they know and links they saved would change
under them. Name that folder by its full path wherever a step says "the site
folder". If `site-notes.txt` has to sit inside it, that is fine: it holds
nothing private, and you can say it does no harm if it is uploaded. Check
instead that nothing else private is sitting in that folder.

## Partial requests

People often want one piece. Do that piece well and skip the rest.

| The request | Do | Read |
|---|---|---|
| "Make me a website for..." | Steps 1 to 5; step 6 when they are ready | build, addons if needed |
| "Is this ready?" / "check my site" | The check, nothing changed | addons section 2, only if a key or password turns up |
| "Fix what's wrong with it" | The check, fixes in place, before and after | build; addons for forms and keys |
| "How do I put it online?" | The check first, then step 6 | publish |
| "Add a contact form / payment / booking" | Step 3 for that item, then the check | addons |
| "I want my own address" | The domain section | publish |
| "How do I get found on Google?" / "do the SEO" | The search section on the live site; Claude SEO's audit if it is installed | publish, section 8 |
| "Change the text / colours / photo" | The change, then the check on what you touched | build if the layout changes |

For a small change, answer briefly: what changed, how to see it, and that the
site has to be published again for visitors to see it if it is already online.

## Scripts

| Script | What it does |
|---|---|
| `scripts/site_check.py [folder] [--summary] [--json] [--min N]` | Scores a site folder from 0 to 100 and lists what to fix, most important first. Reads files only: runs nothing, sends nothing, changes nothing. `--summary` prints the score and area totals; `--min N` exits 1 below N. |

## References

- `references/build.md`: the folder, page content, yellow notes, the look, the technical baseline, pictures, legal basics, looking at the result.
- `references/addons.md`: what may and may not be in a page, chat links, forms, payments, bookings, newsletter, map, visitor statistics, and what a simple site cannot do.
- `references/publish.md`: choosing a host, click-by-click steps, checks after publishing, changing the site later, the owner's own address, being found in search and a full audit with Claude SEO.
- `references/checklist.md`: the same checks as the script, for doing by hand when there is no Python.
- `assets/page-skeleton.html`: the starting point for every page, with the lines the check looks for and the yellow-note styles.

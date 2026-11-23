# Putting the site online

Read this when the owner asks how to get the site on the internet, or when a
build is finished and the next step is publishing.

## Contents

1. Who does what
2. Before it goes up
3. Which host
4. Steps for each host
5. Right after publishing
6. Changing the site later
7. Their own address (a domain)
8. Being found in search, and a full SEO audit with Claude SEO

Facts about hosts were checked on 2026-11-23. Hosts change their menus and
limits often. When you have web access, open the host's own documentation
before writing click-by-click steps. Either way, tell the owner that a button
may be named slightly differently and what to look for instead.

## 1. Who does what

Publishing makes the site visible to everyone and creates an account in the
owner's name. So the owner does it, in their browser, with you giving the
steps. You do not create accounts, do not ask for passwords or tokens in chat,
and do not publish from the command line unless the owner asks for exactly
that and is already signed in to the host's tool on this machine.

Never say the site is online until the owner tells you its address or you
have loaded that address yourself. "Ready to publish" and "published" are
different things, and the owner will send the link to customers on your word.

What the owner needs from you:

- **One recommended host**, with one line on why and the catch. Mention a
  second only when the first does not fit.
- **Numbered steps**, one action each: where to click, what they will see,
  what to do if they see something else.
- **Which folder to use**: the `site` folder, by its full path. Not the
  project folder around it.
- **What it costs**: nothing for the address the host gives them. Their own
  address (section 7) is optional and costs about 10 to 20 US dollars a year.

## 2. Before it goes up

Run the check. Do not hand over publishing steps while it says "do not
publish" (a secret key, a private file, a pretend password): fix that first,
or give the owner the fix as the first step.

For other failures (broken links, yellow notes, placeholder text), say what is
still open and let the owner choose: some want to see it online first and fill
gaps after. That is their call once they know.

## 3. Which host

All of these serve a folder of plain files for free, give a free address, and
add HTTPS (the padlock) by themselves.

| Host | Pick it when | The catch (checked 2026-11-23) |
|---|---|---|
| **Cloudflare Pages** | The default for a business site: free with no traffic limit on plain files, and business use is fine. | Needs a free account. Drag and drop takes up to 1,000 files, 25 MB each. |
| **Netlify** | The site has a form (Netlify Forms needs no key), or the owner wants the quickest start: the first upload works without an account. | New free accounts get 300 credits a month; each publish uses 15 and traffic uses more. When the credits run out the site is paused until next month. Fine for a small site that changes a few times a month. A site put up without an account disappears in about an hour unless they sign up to keep it. |
| **GitHub Pages** | The owner already has a GitHub account, or the project already lives there. | The files are public, in a public repository, on the free plan. GitHub's terms do not allow using it as free hosting for running an online business or shop. More steps than the others. |
| **Vercel** | Personal sites only. | The free plan is for personal, non-commercial use. Do not recommend it for a business. |

Free addresses look like `name.pages.dev`, `name.netlify.app`,
`name.github.io`.

If the project needs a build step (it has a `package.json` with a build
command), drag and drop of the source folder does not work on most hosts: the
folder to upload is the build output (`dist`, `build` or `out`), freshly
built. Say which.

## 4. Steps for each host

Adapt the wording to the owner; keep one action per step. Give the folder as a
full path they can find in their file manager.

### Cloudflare Pages (drag and drop)

1. Go to dash.cloudflare.com and create a free account (email and password),
   then confirm the email they send.
2. In the menu on the left choose **Workers & Pages**, then **Create
   application**, then the **Pages** tab if there is one, then **Drag and drop
   your files** (also called "Upload assets" or "Direct Upload").
3. Type a project name. It becomes the address: `name.pages.dev`.
4. Drag the `site` folder into the box, or zip it and drag the zip. Wait for
   the upload, then choose **Deploy site**.
5. The page shows the address. Open it, and send it to me so I can check it.

To update later: open the project, **Create a new deployment**, drag the
folder again.

Cloudflare also has a no-account page, cloudflare.com/drop, where a dropped
folder goes live at once and must be claimed with an account within 60
minutes.

### Netlify (drag and drop)

1. Go to app.netlify.com and sign up for a free account (email, or an
   existing Google account), then confirm the email they send.
2. Go to app.netlify.com/drop.
3. Drag the `site` folder onto the page. A folder, not a zip. In about a
   minute the page shows an address ending in `.netlify.app`.
4. To choose a nicer address: the site's settings, **Domain management**,
   edit the site name.

The drop page also works without an account, but a site put up that way is
temporary (about an hour) unless they sign up to keep it. Signing up first
avoids a link that dies after they have sent it to someone.

To update later: open the site in Netlify, go to **Deploys**, and drag the
folder onto the box at the bottom of that page. The address stays the same.

For a Netlify form: in the site's menu open **Forms**, choose **Enable form
detection**, then publish the folder once more. Messages appear under Forms
and can be sent on to an email address in the form's notification settings.

### GitHub Pages (in the browser)

1. Create a free account at github.com and confirm the email.
2. Top right: **+**, **New repository**. Give it a name, choose **Public**,
   **Create repository**.
3. Choose **uploading an existing file**, then drag in what is *inside* the
   `site` folder (not the folder itself), so that `index.html` is at the top
   level. At most 100 files at a time. **Commit changes**.
4. **Settings**, **Pages**. Under "Build and deployment" set Source to
   **Deploy from a branch**, branch **main**, folder **/ (root)**, **Save**.
5. After a minute or two the same page shows the address:
   `username.github.io/repository-name`.

Addresses that start with a slash break here, because the site lives in a
sub-folder of the address. The check has a note when a site uses them.

To update later: open the repository, **Add file**, **Upload files**, drag in
the changed files, **Commit changes**.

### From the command line

Only when the owner asked for it and is signed in already. Each tool's sign-in
opens a browser window for the owner to approve.

- Netlify: `netlify deploy --dir=site --prod`
- Cloudflare: `npx wrangler pages deploy site`
- GitHub: `git push`, with Pages set up once in the repository settings

## 5. Right after publishing

Ask the owner for the address, then:

1. **Load it yourself** if you can, and run through it: every page opens,
   pictures show, links work. Letter-case mistakes in file names show up only
   now.
2. **Fill in the full addresses.** `og:image` (and `og:url` if present) must
   start with `https://` and the real address, or the share picture will not
   appear in chat apps. Add the canonical line and the other items in
   section 8 at the same time. This means publishing once more. Tell the
   owner why.
3. **Ask them to open it on their phone**, on mobile data if they can, and
   tell you anything that looks wrong.
4. **Test each add-on for real**: send a message through the form and find it
   in their inbox (and spam folder), open the payment link, make a test
   booking.
5. **Share preview**: paste the link into a chat with themselves and see the
   title and picture. Apps keep an old preview for a while; a wrong first
   preview may take a day to refresh.

Search engines find a new site on their own within days to weeks, sooner if
other sites link to it. Do not promise a position in search results. The
free, effective steps are the owner's: add the address to their Google
Business Profile and their social profiles. Section 8 has the rest.

## 6. Changing the site later

Write this into `site-notes.txt` in the owner's words, with the real paths
and the host they chose:

1. Open this folder with the agent and say what should change.
2. Look at the result by double-clicking `index.html`.
3. Publish again the same way as the first time (the exact steps for their
   host). The address stays the same.

Also write down: which host and which account email they used (never the
password), which services the add-ons use, and what is still marked with
yellow notes. Remind them once that the folder on their computer is the only
copy of the site's source: a copy in their cloud drive or on a USB stick is a
sensible habit.

## 7. Their own address (a domain)

Optional. The free address works for as long as they like; a domain
(`sugarandthyme.co.uk`) looks more established and stays theirs if they change
hosts.

- **Cost** (checked 2026-11-23): a `.com` is roughly 11 to 16 US dollars a
  year, every year. Watch for cheap first-year prices that renew higher.
  Country endings differ. It is the owner's purchase, in the owner's name and
  with their own payment details; you do not buy it.
- **Where**: a registrar such as Cloudflare Registrar (sells at cost; easiest
  if the site is on Cloudflare), Porkbun or Namecheap. Decline the extras
  offered at checkout (hosting, site builders, "SEO"). Privacy protection for
  their contact details is worth having and is usually free.
- **Connecting it**: in the host's dashboard, the site's **Custom domains**
  (Cloudflare Pages, GitHub Pages) or **Domain management** (Netlify) screen
  shows the records to add at the registrar. Follow the host's own
  instructions for this step; they differ by registrar and change. It can
  take from minutes to a day to start working. HTTPS is added by the host.
- **After**: update `og:image` and `og:url` to the new address and publish
  again.

Email at their domain (`hello@sugarandthyme.co.uk`) is a separate paid
service from an email provider. Mention it only if they ask.

## 8. Being found in search, and a full SEO audit with Claude SEO

The check covers what every page needs before it goes up: a title, a
description, one main heading, a share picture. These are the next things,
and most of them need the site's real address, so they belong here, after
publishing. In the owner's words this is "being found on Google"; say "SEO"
only if they do.

The thresholds below follow the page checks of
[Claude SEO](https://github.com/AgriciDaniel/claude-seo) by Agrici Daniel
(MIT), a free SEO audit plugin for Claude Code. Facts about search engines
were checked on 2026-11-23.

**On every page**

- **Title** under about 60 characters, **description** between about 120 and
  160. Longer ones are cut off in results; that is a display limit, not a
  rule. The description says something the title does not: a description that
  repeats the title and ends on "Contact us today!" reads as machine-made.
- **A canonical line** with the page's full address, so that copies of the
  page (with or without `www`, with tracking codes on the end) count as one:
  `<link rel="canonical" href="https://the-real-address/page.html">`.
  `og:url` carries the same address.
- **The first picture on the page is not lazy loaded.** It is usually the
  largest thing on the first screen, and `loading="lazy"` delays it. Lazy
  loading is for pictures further down.
- **The first paragraph says what this is, where, and for whom**, in full
  sentences, with the name in it. Search engines and AI assistants quote
  pages that answer plainly. No file such as `llms.txt` is needed for that;
  the large AI search services have not said they use it.

**Once for the site**

- **A sitemap** when there is more than one page: `sitemap.xml` in the site
  folder, listing each page's full address. The owner submits it in Google
  Search Console, which needs their Google account and a verification step
  that you can walk them through.
- **`robots.txt` only if there is something to keep out**, and it only counts
  at the very top of an address. On a sub-address such as
  `name.github.io/project/` it is ignored. A simple site needs none: with no
  file, everything may be read, AI search crawlers included.
- **A block of structured data** (JSON-LD) that says what the site is, using
  only facts the owner gave: `LocalBusiness` for a business with an address
  and opening hours, `Person` for a portfolio, `Organization` otherwise.
  Addresses inside it are full addresses. Never add review or rating markup
  for reviews that are not real and shown on the page. Question-and-answer
  (`FAQPage`) and how-to markup no longer produce a special result on Google
  (retired in May 2026 and September 2023), so add them only if they help
  some other reader.

**Outside the site**, which matters more than anything in the files: for a
local business, a complete Google Business Profile with the site's address;
the address on every social profile; links from real places that mention the
business. These are the owner's to do.

### A full audit with Claude SEO

When the site is online and the owner wants more than the basics, use Claude
SEO if it is installed in this agent (its commands start with `/seo`):

```text
/seo page https://the-real-address/     one page, in depth
/seo audit https://the-real-address/    the whole site
```

Read its findings with this site in mind before acting on them. It is built
for sites of every size, so some advice will not fit a three-page site on a
free host (response headers the host does not let you set, tools that need
paid data). Fix what applies, in the site's plain files, and tell the owner
in plain words what changed and what you left.

If it is not installed, mention it once as a free, optional tool and give the
owner its page. Installing a plugin changes their setup and downloads a
separate program, so it is their decision; do not install it unasked.

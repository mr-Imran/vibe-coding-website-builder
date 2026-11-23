# Building the site

Read this before writing the first file. It covers the folder, the content,
the look, and the technical baseline that the check measures.

## Contents

1. The folder
2. What goes on the page
3. Yellow notes
4. The look
5. Technical baseline
6. Pictures
7. More than one page
8. Trust and legal basics
9. Looking at it before the owner does

## 1. The folder

```
<project folder>/
├── site/               everything in here goes online, and nothing else does
│   ├── index.html      the home page; this exact name, lower case
│   ├── style.css
│   ├── favicon.svg
│   └── images/
└── site-notes.txt      for the owner: how to see it, change it, publish it
```

One rule makes this safe for someone who cannot read code: **what is inside
`site` is public, what is outside is not.** Notes, original full-size photos,
drafts and anything private stay outside. Tell the owner this rule in one
sentence when you hand over.

File names: lower case, no spaces, hyphens between words (`about-us.html`,
`chocolate-cake.jpg`). Hosting computers treat `Photo.JPG` and `photo.jpg` as
two different files; Windows and macOS do not. A site that mixes them looks
fine on the owner's computer and has missing pictures once it is online.
Rename files the owner gives you (`IMG_4032.HEIC`) to say what they show.

No build step: no npm, no framework, no bundler. The files you write are the
files that go online. The owner cannot repair a failed build, and every tool is
one more thing that stops working in a year. Plain HTML and CSS, and a few
lines of JavaScript only where the page needs to react (a menu button, a
gallery). If a project you are asked to work on already uses a framework,
leave it in place and work inside it.

Start each page from `assets/page-skeleton.html` in this skill's folder.

## 2. What goes on the page

A simple site has one job: a stranger arrives, understands in a few seconds
what this is and whether it is for them, and does one thing (calls, writes,
books, buys, follows). Build the page around that one thing.

The usual order for a home page:

1. **Top**: who this is, what they offer and for whom, in the owner's words.
   One sentence a customer would say, not a slogan. Then the one action, as a
   button.
2. **Proof it is real**: photos of the actual work, place or person.
3. **What is on offer**: services, products, prices if the owner gave them.
4. **Practical details**: where, when, how to reach them.
5. **The action again** at the bottom.

Write with what the owner told you. Use their words where they work; tidy
spelling and grammar. Keep sentences short. Do not pad a page to make it look
full: three true sections beat seven where four are filler.

**Never fill a gap with something made up.** Not a review, a customer name, a
star rating, a "trusted by 500+", an opening hour, a price, an address, a team
member, a founding year, an award. To the owner these look like part of a
finished site; they cannot tell which lines you invented, and they will publish
them. Visitors will take them as fact, and invented reviews and numbers are
illegal in many countries. If a section needs something you do not have, either
leave the section out or put a yellow note where the fact goes.

The site's text is in the language of its visitors, which may differ from the
language the owner writes to you in. Ask if it is not obvious. Set `lang` to
match, and `dir="rtl"` for right-to-left languages.

## 3. Yellow notes

A yellow note is a visible marker for something only the owner knows:

```html
<p>Open <mark class="needs-you">your opening hours</mark></p>
<div class="needs-you needs-you-photo">Photo: your best cake, from above</div>
```

Say inside the note exactly what is wanted, in the owner's language. They show
up bright yellow in the browser, so the owner sees where the gaps are without
reading any code, and can answer in chat ("the hours are 9 to 5, closed
Monday"). The check counts every note that is left and will not call the site
ready while one remains.

Use them for facts. Do not use them to avoid decisions that are yours to make
(layout, wording of a heading, which section comes first).

A photo note should say what the photo should show and its shape (wide, tall,
square), so that the owner can pick one that fits.

## 4. The look

The owner will judge the site by how it looks, and so will their visitors. A
page that looks like every other machine-made page (purple gradient, three
identical cards with icons, centred everything, an emoji in each heading) tells
visitors nobody cared.

Take the direction from the thing itself. A bakery, a law office, a punk band
and a physiotherapist should not look alike. Before writing CSS, decide in one
line what the feeling is (warm and handmade, calm and exact, loud and playful)
and let that pick the rest:

- **Colour**: one background, one text colour, one accent for the action. Take
  the accent from something real when you can: the logo, the shopfront, the
  product. Text must be easy to read on its background (dark on light or light
  on dark, never mid-grey on white).
- **Type**: at most two families. System fonts cost nothing and load at once:
  `system-ui, sans-serif` for a modern look, `Georgia, serif` for a
  traditional one. Loading fonts from another company's server sends each
  visitor's address to that company, which needs consent in some countries; if
  a special font matters, put the font file in the site folder. Body text 16px
  or larger, lines no longer than about 70 characters.
- **Space**: generous and uneven on purpose. More space between sections than
  inside them. One thing per screen that is clearly the largest.
- **Photos do the work.** Real photos of the real thing, large. When the owner
  has not sent them yet, leave photo notes at the right size; do not decorate
  the gaps with stock pictures of strangers.
- **The action** looks like a button, says what happens ("Message me on
  WhatsApp", "Book a table"), and appears at the top and the bottom.

If the owner named a site they like, look at what it does (the amount of
space, the type, how photos are used) and carry over that feeling. Do not copy
its text, pictures or logo.

## 5. Technical baseline

Every item here is something the check measures or something that breaks for
visitors.

- **Works by double-click.** Addresses are relative and have no leading slash
  (`images/cake.jpg`, not `/images/cake.jpg`). No `fetch` of local files and
  no `type="module"` scripts: browsers block both when a page is opened from
  disk. The owner's way to see the site is to double-click `index.html`.
- **Phone first.** Most visitors arrive on a phone. Write the layout for a
  narrow screen, then widen it with `@media (min-width: ...)`. No fixed widths
  above a phone's (`max-width` instead of `width`). `img { max-width: 100%;
  height: auto; }`. Buttons and links large enough for a thumb (about 44px
  high). Do not disable zoom.
- **Navigation without JavaScript where possible.** A handful of links that
  wrap onto a second line needs no menu button. If there is a menu button, it
  must work with the keyboard.
- **Every link and button goes somewhere.** No `href="#"`. If the destination
  does not exist yet, leave the link out.
- **Phone numbers and email are links**: `tel:+447700900123`,
  `mailto:name@domain`. Chat links are in `references/addons.md`.
- **One `h1` per page**, headings in order, a `main`, a `header`, a `footer`.
- **Every form field has a visible `<label>`.** Grey hint text inside the box
  disappears when someone starts typing.
- **External links** open in the same tab unless there is a reason not to; when
  you use `target="_blank"`, add `rel="noopener"`.
- **Nothing secret in any file under `site/`.** See the ground rules in
  SKILL.md and the list in `references/addons.md`.
- **Favicon**: a small SVG is enough, for example the first letter of the name
  on the accent colour.
- **Share picture** (`og:image`): a JPEG or PNG about 1200 x 630, usually the
  best photo. Apps do not show SVG here. If no real photo exists yet, leave
  the tag out and list it under "Needs you"; do not point it at a file that is
  not there.

## 6. Pictures

Photos from a phone are 3 to 10 MB each. On a mobile connection one of those
takes many seconds. Before a picture goes into `site/images/`:

- Resize it to the largest size it is shown at: about 1600 pixels wide for a
  full-width picture, 800 for half-width.
- Save photos as JPEG (quality about 80) or WebP. PNG only for logos and
  drawings. Aim for under 300 KB each; the check flags anything over 500 KB.
- Keep the original outside `site/`, so nothing is lost.
- Convert HEIC (iPhone) to JPEG; browsers other than Safari do not show it.

Use whatever is on the machine: `sips` on macOS, ImageMagick (`magick`), `cwebp`,
`ffmpeg`, or on Windows the built-in .NET imaging through PowerShell
(`System.Drawing`). If nothing is available, ask the owner to shrink the
photos with a free in-browser tool such as squoosh.app, and say exactly which
files and what width. Do not install software on their machine to do it.

Give every `<img>` an `alt` that says what is in the picture (empty `alt=""`
for pure decoration), `width` and `height` attributes so the page does not
jump while loading, and `loading="lazy"` on pictures below the first screen.

Only use pictures the owner has the right to use: their own, or ones from a
free-licence library (Unsplash, Pexels and Pixabay allow commercial use
without credit; each forbids a few things such as reselling the photo
unchanged). Download them into the site folder; do not load pictures from
another website's address. Never use a picture found through a search.
Pictures of identifiable people need those people's agreement; that is the
owner's to confirm.

## 7. More than one page

Start with one page. Add a page only when its content would make the home page
too long or is a different errand (a full menu, a price list, a gallery, an
"about" story). Five pages is a lot for a simple site.

Without a build step the header and footer are copied into each page. Keep them
identical; when you change one, change all, and say so in `site-notes.txt` so
a later session knows. Link pages by file name (`about.html`).

## 8. Trust and legal basics

You are not the owner's lawyer, and the rules depend on their country. Raise
these under "Needs you" when they apply, in one line each, and build what they
decide.

- **A form, a newsletter sign-up or visitor statistics** means the site
  collects personal data. In the EU, the UK and many other places that calls
  for a short privacy page saying what is collected, why, and who to contact.
  Offer to draft one from the facts of this site for the owner to check.
- **Cookie banners** are needed only when the site sets cookies or similar
  that are not essential (most advertising and tracking tools, some embeds).
  A plain site with none needs no banner, so do not add one by reflex. Prefer
  tools that work without cookies (see `references/addons.md`).
- **Business details**: some countries require a business site to show the
  legal name, address and registration details (an "Impressum" in Germany,
  Austria and Switzerland). Ask where the business is based.
- **Prices, health claims, regulated trades**: write only what the owner
  states.

## 9. Looking at it before the owner does

Run the check (SKILL.md, step 4). It reads the files; it does not see the
page. So also look:

- If you have a browser tool, open `index.html` and take screenshots at a
  phone width (about 390 pixels) and a desktop width (about 1280). Look for
  text that overflows, things that overlap, pictures that are stretched, a
  page that scrolls sideways.
- If you do not, look for Chrome or Edge on the machine: both can take a
  picture of a page without opening a window, for example
  `chrome --headless=new --screenshot=phone.png --window-size=390,2000 <address>`
  (the program is `chrome.exe` or `msedge.exe` under Program Files on Windows,
  "Google Chrome" inside its application folder on macOS). Save the pictures
  outside the site folder and look at them. For pages behind a sign-in, start
  the browser with `--remote-debugging-port` and drive it from a short script.
  (An app built from the starter has that script already: `node tools/look.js`,
  see section 8 of `references/app.md`.)
- If there is no browser at all, read your own CSS once more as a narrow
  screen would apply it, and tell the owner to make the browser window narrow
  to see the phone layout.

Then open the page for the owner (`start`, `open` or `xdg-open` followed by
the path to `index.html`), and tell them how to do it themselves: double-click
`index.html` in the `site` folder.

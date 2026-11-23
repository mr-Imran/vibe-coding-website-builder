# The check, by hand

Use this only when `scripts/site_check.py` cannot run (no Python on the
machine). It lists the same checks with the same points. Read the files, mark
each check met or not met, and add up the points of the ones that are met.
Leave out a check that does not apply (no form on the site: skip the form
checks) and say the score is out of the points that remain.

Search the files with your own tools; the patterns in brackets are what to
search for.

## Safe to publish (30)

| Points | Check | How to look |
|---|---|---|
| 15 | No secret keys in the files | Search every text file, built bundles included, for `sk_live_`, `sk_test_`, `rk_live_`, `sk-`, `sk-ant-`, `AKIA`, `ghp_`, `github_pat_`, `xox`, `SG.`, `re_`, `sb_secret_`, `service_role`, `BEGIN PRIVATE KEY`, `hooks.slack.com`, `discord.com/api/webhooks`, a Telegram bot token (digits, a colon, `AA...`), and database addresses with a password in them (`postgres://user:pass@`). A Google key (`AIza...`) is normal for Maps and Firebase but not when it is used for Gemini. |
| 6 | No private files in the folder that goes online | `.env` files, `*.pem`, `*.key`, `id_rsa`, `credentials.json`, `*.sql`, `*.sqlite`, `*.db`, `*.bak`, `*.log`, `.htpasswd` |
| 4 | No pretend password protection | Code in the page that compares what the visitor typed with a password written in the code |
| 3 | Nothing loaded or sent over an insecure address | `http://` in `src`, a stylesheet `href` or a form `action` |
| 2 | No secrets in settings that get built into the site | In `.env` files, names starting `VITE_`, `NEXT_PUBLIC_`, `REACT_APP_`, `PUBLIC_` that hold a secret |

Any of the first, second, third or fifth failing means: do not publish.

## Everything works (25)

| Points | Check | How to look |
|---|---|---|
| 5 | The home page is `index.html`, lower case, at the top of the site folder | List the folder |
| 8 | Every linked picture, page and file exists | Compare every `src`, `href`, `srcset` and CSS `url()` with the real file names, letter for letter. Upper and lower case must match: list the folders and compare exactly, because Windows and macOS will not show the difference. |
| 2 | Links to a spot on a page find it | Every `#name` has an element with that `id` |
| 3 | Nothing points at this computer | `localhost`, `127.0.0.1`, `file:`, `C:\`, `/Users/`, `/home/` |
| 3 | Every link and button does something | `href="#"`, `href=""`, `javascript:void(0)`, buttons with no handler |
| 4 | Every form really sends | The form has an `action` at a real form service, or code that sends the data somewhere. Code that only shows a thank-you message fails. A stand-in such as `YOUR_FORM_ID` fails. |

## Fits a phone (10)

| Points | Check | How to look |
|---|---|---|
| 5 | Every page has `<meta name="viewport" content="width=device-width, initial-scale=1">` | Each `.html` file |
| 3 | The layout adapts | The CSS has `@media` rules by width, or wrapping flex or grid layouts |
| 2 | Nothing is fixed wider than a phone | `width:` or `min-width:` above 320px outside a `@media` rule and without `max-width` beside it |

## Real content (15)

| Points | Check | How to look |
|---|---|---|
| 5 | No placeholder text | Lorem ipsum, "Your Company Name", "[Your ...]", `{{...}}`, TODO, example.com addresses, 555 phone numbers, "123 Main Street", "John Doe" |
| 2 | No placeholder pictures | Addresses at placeholder services (placehold.co, via.placeholder.com, picsum.photos, pravatar and the like), and files in the site folder named as stand-ins (`placeholder-1.svg`), often next to "Photo coming soon" |
| 3 | No open yellow notes | Elements with `class="needs-you"` |
| 2 | No leftover default titles | "Document", "Untitled", "Vite + React", "React App", "My Website" |
| 3 | A visitor can do something | At least one phone, email, chat, booking, payment or social link, or a form |

Also list for the owner, without points: reviews, star ratings, customer
numbers, "trusted by", awards and years in business. Only they know whether
those are true.

## Found and shared (12)

| Points | Check | How to look |
|---|---|---|
| 3 | Each page has its own title | `<title>` present and different on each page |
| 2 | The home page has a description | `<meta name="description">` of 30 characters or more |
| 1 | Each page says its language | `<html lang="...">` |
| 1 | One main heading per page | Exactly one `<h1>` |
| 2 | A browser-tab icon | `<link rel="icon">` pointing at a real file, or `favicon.ico` in the site folder |
| 3 | A shared link shows a title and a picture | `og:title` and `og:image` on the home page, the picture file exists |

## Easy and fast (8)

| Points | Check | How to look |
|---|---|---|
| 2 | Pictures have a text description | Every `<img>` has an `alt` attribute |
| 1 | Form fields have labels | A `<label>` for each field; hint text inside the box does not count |
| 1 | Links and buttons say what they do | No link or button without text or a label |
| 1 | Visitors can zoom | The viewport line has no `user-scalable=no` or `maximum-scale=1` |
| 2 | No heavy pictures | No image file over 500 KB |
| 1 | The home page is light | Everything `index.html` loads from the folder adds up to under 3 MB |

## Verdict

- **Do not publish**: a secret key, a private file, a pretend password.
- **Not yet**: a missing home page, broken links, a form that sends nothing,
  addresses on this computer, placeholder text or pictures, open yellow
  notes, a page without the viewport line, or a score under 80.
- **Ready**: none of the above.

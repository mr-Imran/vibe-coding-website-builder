# Add-ons: forms, chat, payments, bookings and the rest

A simple site has no server of its own, so anything that receives data or
takes money is done by a hosted service: the owner opens an account there, the
service gives them a link or a snippet, and that goes into the page.

Read the section you need.

## Contents

1. How every add-on works
2. What may be in the page and what may not
3. Getting in touch: chat links, email links, forms
4. Payments
5. Bookings
6. Newsletter sign-up
7. Map
8. Visitor statistics
9. What a simple site cannot do

Facts about plans and limits were checked on 2026-11-23. They change. When you
have web access, open the service's own page before quoting a limit or giving
click-by-click steps, and tell the owner that menu names may differ slightly.

## 1. How every add-on works

The same four steps each time:

1. **Recommend one service**, with a one-line reason. The owner cannot weigh
   five options; they need a default and the catch that comes with it (the
   free limit, the fee).
2. **The owner makes the account.** You never sign up for them, never ask for
   a password, never ask them to paste a secret key into chat. Give numbered
   steps: where to go, what to click, and what to copy at the end.
3. **They paste back the public part**: a form address, a payment link, an
   embed snippet. You put it in the page.
4. **Test it for real** and say how: send a message through the form and see
   it arrive, open the payment link and stop before paying.

Until step 3 has happened, the page shows a yellow note where the add-on goes
(`<div class="needs-you">Contact form: waiting for your form address</div>`),
or a working alternative (an email link). Do not put a made-up form address or
link in the page: it looks finished, the owner publishes it, and messages
vanish. A form that shows "Thank you" and sends nothing is the most common
fault on sites made this way.

## 2. What may be in the page and what may not

Everything in the site's files is sent to every visitor. Anyone can read it
with two clicks, however it is hidden.

| In the page | Never in the page |
|---|---|
| A form address or form ID | Any key the service calls secret, private or server-side |
| A key the service's own documentation calls public or publishable (Stripe `pk_...`, a Web3Forms access key, a Supabase publishable/anon key) | Stripe `sk_...` and `rk_...`, a Supabase `service_role` or `sb_secret_` key |
| A payment link, a booking link | A key for an AI service (OpenAI, Anthropic, Gemini...). They are billed per use; a copied key runs up the owner's bill |
| An embed snippet copied from the service | A password, a database address, a bot token, a chat webhook address |

When you cannot find the service's own statement that a key is public, treat
it as secret.

**If a secret is already in the site**, taking it out is half the fix. If the
site was ever online, or the files were shared or pushed to a public
repository, the key must be assumed copied: the owner has to make a new one in
that service's dashboard and switch the old one off (services call this
"roll", "rotate" or "revoke"). Give them the steps and put this first in your
report. Whatever needed the secret (taking a payment, calling an AI service)
has to be replaced with a hosted alternative from this file, or it stops
working. Say that plainly.

A password that is checked by code inside the page protects nothing: the page
and the password are both sent to every visitor. There is no safe way to
password-protect part of a simple site from within its own files. Some hosts
offer it as a paid feature; otherwise see section 9.

## 3. Getting in touch

Start with the question "where does the owner already answer people?" For many
small businesses that is a chat app or the phone, and a link to it beats a
form: nothing to set up, nothing to break, and the reply comes from where they
already are.

**Chat and call links** (no account, work at once):

```html
<a href="https://wa.me/447700900123?text=Hi%2C%20I%27d%20like%20to%20order%20a%20cake">Message me on WhatsApp</a>
<a href="tel:+447700900123">Call 07700 900123</a>
<a href="mailto:hello@example.org?subject=Order">Email hello@example.org</a>
<a href="https://ig.me/m/USERNAME">Message me on Instagram</a>
```

The WhatsApp number is in full international form, digits only (country code,
no plus sign, no leading zero, no spaces). An email address in the page will
collect some spam over time; mention that once.

**A form**, when the owner wants one (enquiries with several fields, people
who do not use chat):

| Service | Why pick it | The catch (checked 2026-11-23) |
|---|---|---|
| Netlify Forms | The site is hosted on Netlify. No key, nothing to paste. | Works only on Netlify. Form detection must be switched on in the Netlify dashboard and the site published again. |
| Web3Forms | Any host. The key arrives by email; no dashboard to learn. Its access key is public by design. | Free limit reported as 250 messages a month. |
| Formspree | Any host. Well known, has a dashboard with all messages. | Account needed. 50 messages a month free. |
| FormSubmit | Any host, no sign-up: the form posts to an address containing the owner's email, and the first message triggers a confirmation email. | The owner's email is visible in the page until they swap in the random string FormSubmit sends them. |

Minimal shapes (take the exact snippet from the service's current
documentation):

```html
<!-- Netlify Forms -->
<form name="contact" method="POST" data-netlify="true" netlify-honeypot="bot-field">

<!-- Web3Forms -->
<form action="https://api.web3forms.com/submit" method="POST">
  <input type="hidden" name="access_key" value="THE OWNER'S ACCESS KEY">

<!-- Formspree -->
<form action="https://formspree.io/f/THE-FORM-ID" method="POST">
```

A Netlify form has nothing for the owner to paste back, so it can look
finished in the files while delivering nothing. It works only after three
things on the owner's side: the site is on Netlify, form detection is switched
on in the dashboard, and the site has been published once more after that.
List those under "I need these from you", and call the form unproven until a
test message has arrived in their inbox.

Whichever you use:

- Every field has a `name` and a visible `<label>`.
- Add the service's hidden trap field against spam robots (a "honeypot").
- Ask for as little as possible: name, a way to reply, the message.
- Messages go to the owner's email. Tell them to send a test message after
  publishing and to check the spam folder the first time.
- The form collects personal data: see "Trust and legal basics" in
  `references/build.md`.
- Most form services only work once the site is online, not when the page is
  opened by double-click. Tell the owner so they do not think it is broken.

## 4. Payments

The owner needs an account with a payment company; opening one involves
proving who they are and takes anything from minutes to days. That is theirs
to do. The page only ever holds a link or an embed.

| What they sell | Recommend | Notes (checked 2026-11-23) |
|---|---|---|
| A few fixed-price things, a deposit, a service | **Stripe Payment Links**: made in the Stripe dashboard with no code (Payment Links, New, pick or add a product, Create link). The link goes behind a button. | Works on any host and when the page is opened by double-click. Can also take subscriptions or let the customer choose the amount. |
| The same, shown inside the page | Stripe Buy Button: on a payment link choose "Buy button" and copy the code. | The snippet contains a publishable key (`pk_...`), which is meant to be public. It does not work from a page opened by double-click, only once online. |
| Digital downloads, with tax handled for them | Gumroad | It is the seller of record and deals with sales tax; takes about 10% plus a small fee per sale. |
| Tips and small support | Ko-fi or Buy Me a Coffee | A link or a button. |
| They already use PayPal | PayPal payment links and buttons, made in the PayPal business account | Paste-in snippet. |

Do not recommend Lemon Squeezy: it closed to new accounts and shuts down in
March 2027.

```html
<a class="button" href="https://buy.stripe.com/THE-OWNER'S-LINK">Pay the £10 deposit</a>
```

A site that needs a basket, stock levels, shipping rates and order emails is a
shop. See section 9.

Prices, refund terms and what is sold are the owner's statements. Write only
what they told you.

## 5. Bookings

| Service | Free plan (checked 2026-11-23) |
|---|---|
| Cal.com | Free for individuals, unlimited booking types |
| Calendly | Free plan with one type of appointment and one connected calendar |

Either gives a booking link (simplest: put it behind a button) or an embed
snippet from its "add to website" screen, which shows the calendar inside the
page. The link is the safer default; the embed loads the service's scripts on
the page.

Restaurants, salons and classes often already use a booking system (OpenTable,
Fresha, Square and so on). Ask before adding another: link to the one they have.

## 6. Newsletter sign-up

The service stores the addresses and sends the emails; the page holds its
sign-up form or a link to its sign-up page.

| Service | Free plan (checked 2026-11-23) |
|---|---|
| Kit (was ConvertKit) | Up to 10,000 subscribers |
| Beehiiv | Up to 2,500 subscribers |
| MailerLite | Up to 250 subscribers |
| Buttondown | Up to 100 subscribers |

Use the embed code the service generates. Collecting email addresses means
asking for agreement and offering a way out; the services handle the
unsubscribe link, and the privacy note in `references/build.md` applies.

## 7. Map

Google Maps: find the place, Share, "Embed a map", copy the `<iframe>` it
gives. No key is needed for this kind of embed. It loads Google's scripts and
may set cookies, so in countries with consent rules a plain link is the
lighter choice:

```html
<a href="https://maps.google.com/?q=12+Gloucester+Road+Bristol">Find us on the map</a>
```

Always write the address as text too; a map is not readable by everyone.

## 8. Visitor statistics

Only if the owner asks to know how many people visit. Prefer tools that set no
cookies, so no consent banner is needed in most places (the services say so
themselves; it is not legal advice):

| Service | Free plan (checked 2026-11-23) |
|---|---|
| Cloudflare Web Analytics | Free, one snippet, works on any host |
| GoatCounter | Free for reasonable use, small businesses included |
| Umami Cloud | Free for one site, 100,000 events a month |

Google Analytics sets cookies and needs a consent banner in the EU and UK. Do
not add it unless the owner asks for it by name, and then tell them about the
banner.

## 9. What a simple site cannot do

Say so early and plainly when the request includes one of these. Each needs a
server, a database and someone who can keep them secure, and an owner who
cannot read the code cannot tell whether that was done.

| They ask for | Say | Offer |
|---|---|---|
| Log-in, member areas, user accounts | It needs a real back end; a pretend one in the page keeps nobody out. | A membership or course platform that has log-in built in, linked from the site. |
| A shop with a basket, stock and shipping | That is a shop system. | A hosted shop (Shopify, Square Online, Etsy, Big Cartel) linked from the site; or payment links for a handful of products. |
| A chatbot or anything that calls an AI service | The key cannot be in the page, so it needs a server. | The chat widget of a hosted product that keeps the key on its side. |
| People uploading files, posting comments, leaving reviews | Needs storage and moderation. | A form for sending files by email; reviews on Google or another platform, linked. |
| A blog they update themselves several times a week | Editing HTML by chat for every post gets tiring. | Fine for occasional posts through the agent; for frequent ones, a hosted blog or newsletter linked from the site. |

Then build the simple site around the link. Most owners are better served by
that than by a home-made version of the complex thing.

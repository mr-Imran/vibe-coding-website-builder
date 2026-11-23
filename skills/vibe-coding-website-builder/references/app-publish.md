# Putting an app online

Read this when an app built with `references/app.md` is ready to go live. A
simple site is published differently: see `references/publish.md`.

## Contents

1. What is different from a site
2. Before it goes up
3. Which host
4. Getting the files to the host
5. Steps on Railway
6. Right after publishing
7. Changing the app later
8. Keeping the data safe

Facts about hosts were checked on 2026-11-23. They change often. When you have
web access, open the host's own documentation before writing click-by-click
steps, and tell the owner that a button may be named slightly differently.

## 1. What is different from a site

A site is a folder of files that any host can hand out. An app is a program
that has to keep running, with a database file that has to survive restarts.
That rules out the free hosts for plain files (Cloudflare Pages, Netlify,
GitHub Pages), and it means three things the owner must hear before they
start:

- **It usually costs something.** About five US dollars a month to keep a
  small app awake. Free plans exist but put the app to sleep when nobody is
  using it, so the first visitor waits.
- **The database needs a permanent place.** On a host, the app's own folder
  is wiped on every update. The database file must live on a "volume" (also
  called a disk) that the host keeps. Skip this and every update deletes all
  the data.
- **They are now holding other people's data.** Accounts, emails, whatever
  the app stores. Section 8 is not optional.

As with a site: the owner creates the accounts and clicks publish, you give
the steps. You do not ask for passwords or tokens in chat, and you do not say
the app is online until you have its address.

## 2. Before it goes up

1. `node --test` passes, and `node tools/rubric.js` shows no failing test.
2. The page check gives no "do not publish".
3. No secret is in any file: no `.env` with values, no password in
   `README.md`, no key in `config.js`. `.gitignore` lists `data/` and `.env`.
4. `data/` is not among the files that will be uploaded. It is the local
   test database and may hold the passwords of test accounts.
5. Example data is not loaded on the live app unless the owner asked for a
   demonstration, in which case the README says the data is made up.
6. The owner has chosen the administrator's email. They choose the password
   themselves, in the host's settings screen, where you never see it.

## 3. Which host

| Host | Pick it when | The catch (checked 2026-11-23) |
|---|---|---|
| **Railway** | The default. Everything is done in the browser from a GitHub repository, it gives a free address with https, and it has volumes for the database. | The free plan includes one US dollar of use a month and puts the app to sleep after a few idle minutes; when the dollar is used up the app stops until next month. The Hobby plan is five dollars a month and stays awake. |
| **Render** | The owner already uses it. | The free web service has no permanent disk: the database file is wiped on every restart, so the free plan cannot run this app. A paid service with a disk is about seven dollars a month. |
| **Fly.io** | Someone technical is helping. | Cheapest to run, but set up through a command-line tool. |

Recommend Railway. For a demonstration or a class project the free plan is
enough if the owner accepts the sleep; for anything people rely on, the
five-dollar plan.

## 4. Getting the files to the host

Hosts take an app from a GitHub repository. Two ways to put it there:

**In the browser** (the owner does it, no tools):

1. Create a free account at github.com and confirm the email.
2. Top right: **+**, **New repository**. Name it, choose **Private**,
   **Create repository**.
3. Choose **uploading an existing file** and drag in what is *inside* the
   project folder, without the `data` folder and without any `.env` file.
   Tell them exactly which items to select, by name. At most 100 files at a
   time; a starter-based app is well under that. **Commit changes**.

Files whose names start with a dot (`.gitignore`, `.nvmrc`) are hidden in
some file managers. If they are left out, the app still runs.

**With git on this computer**, only when the owner asks and is already signed
in (`gh auth status` shows an account): create the repository as private and
push. Check first that `data/` and `.env` are ignored. Creating a repository
and pushing are public-facing actions on the owner's account, so do them only
on a clear request.

A private repository is right for an app: nobody needs to read the code, and
a mistake in it is not on display.

## 5. Steps on Railway

Adapt the wording to the owner; one action per step.

1. Go to railway.com and sign up with the GitHub account from section 4.
2. **New Project**, then **Deploy from GitHub repo**, and pick the
   repository. If it is not listed, choose **Configure GitHub App** and allow
   Railway to see that one repository. Railway starts building at once; the
   first build will run but the app is not set up yet.
3. Open the service, then **Variables**. Add these, one by one:
   - `NODE_ENV` = `production`
   - `DATA_DIR` = `/data`
   - `ADMIN_EMAIL` = the email they will sign in with
   - `ADMIN_PASSWORD` = a long password they make up now and keep. It is used
     once, to create their account.
   - `TIME_ZONE` = where the business is, for example `Europe/London`. Hosts
     run on UTC; without this, every rule about a time of day is hours out.
   - any keys for outside services the app uses (named in `.env.example`)
4. Add the permanent place for the database: in the project view,
   right-click the empty area next to the service and choose **Volume**
   (or press Ctrl+K, Cmd+K on a Mac, and type "volume"). Pick the service
   when it asks which one to connect it to, and give `/data` as the mount
   path.
5. **Settings**, **Networking**, **Generate Domain**. This is the app's
   address, ending in `.up.railway.app`.
6. Wait for the deployment to show as active, open the address, sign in with
   the email and password from step 3, and change the password under **Your
   account**.
7. Send me the address so I can check it.

In the service's **Settings**, set the health check path to `/api/health` if
the screen offers one, so the host knows when the app is ready.

If the deployment fails, the owner opens **Deployments**, the failed one, and
**View logs**, and pastes the last lines to you. The usual causes: the Node
version is older than 22.13 (the log shows the version), or the volume is not
mounted at the path in `DATA_DIR`. The app runs on Node.js 22.13 or newer;
the starter's `.nvmrc` asks the host for 26, the version its tests were run
on. If the host does not offer 26 yet, change that file to a version it does
offer, 22 or higher, and say so in the README.

## 6. Right after publishing

With the address in hand:

1. **Load it yourself**: the sign-in page appears, `/api/health` answers,
   pages and styles load.
2. **The owner signs in as administrator and changes the password.** Then
   they can remove `ADMIN_PASSWORD` from the host's variables; it is no longer
   used once an account exists.
3. **Check that data survives an update.** The owner creates one record, then
   in Railway chooses **Redeploy** on the latest deployment, and looks again.
   If the record is gone, the volume is not mounted where `DATA_DIR` points.
   Do this before anyone else uses the app, not after.
4. **Decide about sign-ups.** If only invited people should have accounts,
   set `ALLOW_SIGNUP` to `0` in the host's variables and add people from the
   **People** screen.
5. **Check the time zone.** Make something with a time in it and see that the
   app shows the time the owner expects. If it is hours out, the `TIME_ZONE`
   variable from step 3 of section 5 is missing or misspelt; the app's log
   says which zone it is using when it starts.
6. **Walk the main journey once on the live app**, as each role, on a phone.
7. **Record the address** in `README.md` and as `Live address: https://...`
   in `RUBRIC.md`, run `node tools/rubric.js --write` so that M08 shows as
   met, and upload the changed files again, `RUBRIC-RESULTS.md` among them.

## 7. Changing the app later

1. Open the project folder with the agent and say what should change.
2. The agent makes the change, runs the tests, and starts the app locally so
   the owner can look at `http://localhost:3000`.
3. The changed files go to GitHub the same way as the first time. Railway
   notices and updates the live app by itself within a few minutes.

A change to the database's tables is always a new numbered file in
`migrations/`, never an edit to an old one: the live database has already run
the old ones, and it runs each file once.

Write these steps into `site-notes.txt` with the real names and addresses.

## 8. Keeping the data safe

Say these to the owner in plain words when the app goes live, and put them in
`site-notes.txt`:

- **Back it up.** The whole app's data is one file on the host's volume. A
  host can lose a volume, and a mistaken update can damage data. The
  **People** screen has a **Download a backup** button for the first role
  (it comes with the starter, in `core/backup.js`). Have the owner press it
  once now, to see that a file arrives, and suggest a regular day for it.
  Backups go somewhere private: they contain everyone's records. Going back
  to a backup means replacing the database file on the host's volume, which
  needs you or someone technical; say that now, not on the day it is needed.
- **It holds personal data.** In the EU, the UK and many other places that
  brings duties: a privacy page saying what is stored and why, a way for a
  person to have their data removed, and telling people if it leaks. Offer to
  draft the privacy page from what the app really stores. You are not their
  lawyer.
- **Passwords cannot be recovered**, only replaced: the app stores hashes.
  An administrator sets a new one for someone who is locked out on the
  **People** screen.
- **What was tested and what was not.** The tests cover the cases in
  `RUBRIC.md`. Nobody has tried to break in on purpose. Before the app holds
  anything sensitive (health, money, children's data), someone who can read
  code should review it.
- **Money.** If the app takes payments, the payment company's hosted page
  takes the card; the app only records the result. The app never sees or
  stores card numbers.

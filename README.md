# AI Hiring Radar

Finds fresh engineering roles across 108 verified company job boards, sorts them into two
tabs, and applies for you with the resume you picked for that tab.

- **Tab 1 — AI · Infra · Agentic**: AI infrastructure, AI engineer, agentic/LLM, ML, platform,
  backend and general software engineering.
- **Tab 2 — Forward Deployed**: FDE, solutions/customer/implementation engineering, sales
  engineering, developer relations.

Each tab holds its own resume, so the AI resume goes to AI roles and the FDE resume goes to FDE
roles without you re-picking every time. Select any number of roles and apply to all of them in
one action.

A live scan currently pulls ~12,400 postings and keeps ~3,900 that match a track.

## Quickstart

```bash
npm install
cp .env.example .env          # set DATABASE_URL
npm run prisma:deploy         # create the schema
npm run prisma:seed           # load the 108 verified job boards
npm run dev                   # http://localhost:3000
```

Then, in the app:

1. **Settings → Profile** — name, email, phone, links, work authorization. Applications cannot
   be sent until name and email are set.
2. **Upload resume** on each tab. The tab you upload from decides which track it defaults to.
3. **↻ Refresh jobs** — first scan takes about 15 seconds.
4. Select roles and hit **⚡ Apply**.

## How applying actually works

This is the part worth being precise about, because "one-click apply" is doing real work here
and there are limits that no amount of code gets around.

**No public ATS lets a third party submit an application on your behalf.** Greenhouse's and
Lever's apply endpoints both require an API key that only the employer can issue. So the app
uses three paths, in order of how hands-off they are.

### 1. Browser worker — fully automatic

Runs Chromium on your machine, opens each queued job, fills the form, attaches the right resume,
and submits. This is what **Apply** queues by default.

```bash
npx playwright install chromium   # once
npm run worker                    # fills forms, screenshots, never submits
npm run worker -- --submit        # actually submits
npm run worker -- --once --headed # drain the queue once, watch it work
```

Start in the default dry-run mode. It fills every form and saves a full-page screenshot to
`.worker-screenshots/`, so you can confirm the answers are right before letting it submit
anything. Jobs it cannot fill are marked **Apply manually** with the reason.

The worker cannot run on Vercel — serverless functions cannot host a browser. Run it locally or
on any always-on box.

| Env | Purpose |
| --- | --- |
| `RADAR_URL` | Where the app is (default `http://localhost:3000`) |
| `RADAR_TOKEN` | Must match the server's token when one is set |
| `PLAYWRIGHT_CHROMIUM_PATH` | Use an existing Chromium instead of the bundled one |
| `WORKER_SCREENSHOT_DIR` | Where dry-run screenshots go |

`HTTPS_PROXY` is honoured if set.

### 2. Chrome extension — one click, in your own browser

Keeps your logged-in sessions, and can attach the resume file — which a bookmarklet cannot.

`chrome://extensions` → Developer mode → **Load unpacked** → pick `extension/`, then set your
radar URL in the popup. On any Greenhouse / Lever / Ashby / Workday application page a **⚡
Autofill** button appears bottom-right.

### 3. Bookmarklet — nothing to install

**Settings → Auto-apply setup** generates a bookmarklet you drag to your bookmarks bar. It fills
text fields on any application page.

It cannot attach your resume, and that is not a bug: Greenhouse and Ashby both send
`connect-src 'self'`, so a script running on their page is blocked from fetching your resume
file out of this app. The extension and the worker are not subject to that restriction.

### Direct ATS submission

If you ever hold an employer-issued key, put it in the env and those jobs submit server-side
with no browser at all:

```bash
GREENHOUSE_BOARD_KEYS='{"anthropic":"<job board api key>"}'
LEVER_APPLY_KEYS='{"palantir":"<posting api key>"}'
```

Everything else falls back to browser automation, which needs no credentials.

## Application states

| State | Meaning |
| --- | --- |
| Queued | Waiting for the browser worker |
| Submitted | Actually sent |
| Apply manually | The form could not be filled automatically — open the link |
| Opened | You opened the posting yourself |
| Failed | The attempt errored; the reason is on the row |

## Job boards

`data/companies.json` holds 108 boards, every one of which was checked against the live ATS API
and returns real postings — 58 Greenhouse, 44 Ashby, 6 Lever.

Add your own in **Settings → Job boards**. The board token is the slug in the careers URL
(`boards.greenhouse.io/`**`anthropic`**, `jobs.lever.co/`**`palantir`**,
`jobs.ashbyhq.com/`**`openai`**). It is verified against the live API before it is saved.

Some large employers — xAI, Anduril, Groq, Cerebras, Lambda, Mistral, Cursor — are not included
because they do not expose a public Greenhouse/Lever/Ashby board under a slug that resolves.

## Keeping it fresh

`vercel.json` runs `/api/refresh` daily at 13:00 UTC. Anywhere else, hit the endpoint on a
schedule:

```bash
curl -X POST https://your-app/api/refresh -H "Authorization: Bearer $RADAR_TOKEN"
```

Postings that disappear from a board are marked inactive rather than deleted, so your
application history survives.

## Tests

```bash
npm test
```

Drives the autofill runtime against offline copies of a Greenhouse form, a Lever form, and a
genuinely React-controlled form in Ashby's shape — the case that breaks naive autofillers, since
assigning `input.value` directly is silently reverted by React. 39 assertions covering field
matching, work-authorization vs sponsorship (easy to answer backwards), EEO selects, radio
groups, resume attachment, and the submit path.

## Deploying

Set `DATABASE_URL` and `RADAR_TOKEN` in your host, then deploy. `vercel-build` runs
`prisma migrate deploy` first.

### If a deploy fails on migrations

`P3018` (a migration failed) or `P3009` (failed migrations found, new ones will not be applied)
means Prisma has recorded a migration as failed and will block every later deploy until it is
cleared. Point at the production database and run:

```bash
DATABASE_URL="<your production url>" npm run db:recover
```

It prints which tables exist and what the migration history says, marks failed migrations as
rolled back, and re-applies them. Then redeploy.

This is safe to re-run: the migrations use `CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT
EXISTS` and name-guarded constraints, so re-applying one that partially ran leaves existing data
alone.

If the output shows tables `MISSING` while the history says `applied`, the database is not the
one that history was written against. That usually means `DATABASE_URL` was repointed at a
different database, or migrations were run through a transaction-mode connection pooler —
Prisma needs a direct connection for migrations, not the pooled port.

### Read this before putting it on the public internet

**The app has no login.** It is a single-user tool, and `RADAR_TOKEN` is not a substitute for
one — it only guards the machine-to-machine endpoints that the browser never calls:
`/api/refresh`, `/api/apply/queue`, `/api/autofill/payload`.

The endpoints the UI itself uses are unauthenticated, because the browser has no token to send:

- `GET /api/resumes` and `GET /api/resumes/{id}` — **downloads your resume file**
- `GET /api/profile` — your name, email, phone, address and work authorization
- `POST /api/apply` — could fire applications in your name

So put the whole deployment behind access control at the platform level: Vercel's Deployment
Protection, Cloudflare Access, a reverse proxy with basic auth, or a private network. Running it
on `localhost` is fine as-is.

## Layout

```
app/                 Next.js routes; app/api/* is the whole backend
components/          Dashboard, job list, filters, resume bar, settings drawer
lib/classify.ts      Which tab a posting lands in, and its match score
lib/ingest/          Greenhouse, Lever and Ashby adapters + the refresh pass
lib/apply/           Apply dispatch and direct ATS submission
public/autofill.js   The form-filling runtime, shared by all three apply paths
worker/              Playwright worker
extension/           Chrome MV3 extension
test/                Autofill tests and ATS form fixtures
data/companies.json  The 108 verified boards
```

## A word of advice

Automated applications are only as good as the profile behind them. Run the worker in dry-run
first and read a few screenshots; a garbled answer goes to a real hiring team. Bulk-applying to
every role at a company is also noticed. The value here is speed on roles you actually want, not
volume.

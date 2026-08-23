# AI Hiring Radar

Finds fresh engineering roles across 294 verified company job boards, sorts them into two
tabs, and applies for you with the resume you picked for that tab.

- **Tab 1 — AI · Infra · Agentic**: AI infrastructure, AI engineer, agentic/LLM, ML, platform,
  backend and general software engineering.
- **Tab 2 — Forward Deployed**: FDE, solutions/customer/implementation engineering, sales
  engineering, developer relations.
- **Tab 3 — 🤖 Jobright Agent**: a daily AI agent that logs into [jobright.ai](https://jobright.ai),
  applies to every recommendation matching ≥80% (up to 50/day), and reports back here. See
  [Jobright auto-apply agent](#jobright-auto-apply-agent) below.

Each tab holds its own resume, so the AI resume goes to AI roles and the FDE resume goes to FDE
roles without you re-picking every time. Select any number of roles and apply to all of them in
one action.

A deep scan pulls ~40,900 postings and keeps ~12,000 that match a track — 9,232 in the AI tab
and 2,737 in Forward Deployed — including Amazon and Google, read straight from their own
career-site endpoints.

## Quickstart

```bash
npm install
cp .env.example .env          # set DATABASE_URL
npm run prisma:deploy         # create the schema
npm run prisma:seed           # load the 294 verified job boards
npm run dev                   # http://localhost:3000
```

Then, in the app:

1. **Settings → Profile** — name, email, phone, links, work authorization. Applications cannot
   be sent until name and email are set.
2. **Upload resume** on each tab. The tab you upload from decides which track it defaults to.
3. **↻ Refresh jobs** — first scan takes about 40 seconds.
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

## Jobright auto-apply agent

The **🤖 Jobright Agent** tab is the front end of a daily agent run, not another job index.
Once a day a Claude Code session (fired by a scheduled Routine) follows `agent/RUNBOOK.md`:

1. **Log in to Jobright** as the account's email. Google OAuth is avoided in automation
   (Google blocks bot browsers and the agent never types the Google password); instead set a
   Jobright account password and store it as the `JOBRIGHT_PASSWORD` environment variable in
   the Claude environment — never in the repo. Email verification codes are read from the
   connected Gmail automatically.
2. **Fetch today's matches** and keep those with match ≥ `minMatchPercent` (default 80), up to
   `dailyCap` (default 50) — both in `data/agent/config.json`.
3. **Dedupe** against `data/agent/applied.json` — a job is applied to once, ever, keyed by
   Jobright id and by normalized company+title.
4. **Apply**: Jobright's own flow first; if Jobright hands off to the company ATS, the agent
   fills the form on the original site with the same autofill runtime the worker uses. Unknown
   form questions are answered from `data/agent/memory.json`; questions it cannot answer
   safely (work auth, salary, relocation…) are never guessed — the job is parked and the
   question appears in the tab. Answer it once and the agent remembers it forever.
5. **Record**: successes are appended to `data/agent/APPLIED.md` (the tab renders it);
   failures land in `data/agent/pending.json` and show in the tab with both links so you can
   apply by hand and tick them off. The run ends with a commit of `data/agent/**` to `main`,
   which redeploys the app with the fresh state.

The browser mechanics live in `worker/jobright-agent.mjs` (login / matches / apply / snapshot,
JSON output, evidence screenshots on failure) — the agent falls back to driving the browser
itself when Jobright's DOM drifts. The whole procedure, including the hard rules (never
duplicate, never guess blocking answers, never commit secrets, polite pacing), is in
`agent/RUNBOOK.md`; `/jobright-agent` in any Claude session on this repo runs it on demand.

## Application states

| State | Meaning |
| --- | --- |
| Queued | Waiting for the browser worker |
| Submitted | Actually sent |
| Apply manually | The form could not be filled automatically — open the link |
| Opened | You opened the posting yourself |
| Failed | The attempt errored; the reason is on the row |

## Job boards

`data/companies.json` holds 294 boards, every one of which was checked against the live API and
returns real postings — 136 Greenhouse, 107 Ashby, 29 Workday, 16 Lever, 2 SmartRecruiters,
1 Workable, plus Amazon, Google and Microsoft as dedicated sources.

**Big tech** is read from the same endpoints each company's own careers page calls: Amazon's
`amazon.jobs` search JSON and Google's server-rendered results pages (parsed per job card — id,
title, locations, level and minimum qualifications). Both are search-driven like Workday, with
depth set by `BIGTECH_MAX_PAGES`. Microsoft's careers API is wired in too but consistently
answered 503 from the network this was built on — it appears to filter by egress IP — so the
first scheduled scan from GitHub's runners is the real test; if it fails there as well, it shows
up as one failed board and nothing else. Apple's search API is CSRF-locked with no data in the
server-rendered page, and Meta's GraphQL rejects non-browser clients — neither is fetchable
server-side, honestly.

Six ATS providers are read: **Greenhouse**, **Lever**, **Ashby**, **Workday**, **SmartRecruiters**
and **Workable**, plus adapters for **Recruitee** and **Personio** that are wired in and ready for
boards you add yourself.

Workday is the largest single source. Its tenants are enormous — NVIDIA lists ~2,000 roles — so
instead of paging whole boards the adapter pushes filtering server-side with `searchText` and
keeps what could plausibly land in either tab. Its board key encodes all three parts of a Workday
site: `tenant/host/site`, e.g. `nvidia/wd5/NvidiaExternalCareerSite`. Paging depth is set by
`WORKDAY_MAX_PAGES` — the default keeps an in-app refresh inside Vercel's 60s function limit,
and the GitHub Actions scan raises it to 30 because it has no such limit.

Boards were found by generating slug variants for ~410 company names and probing every ATS
API, then verifying identity: Greenhouse exposes the real board name, so that is used instead
of the guess, and Lever/Ashby boards with short generic slugs were checked against their actual
postings. That last step matters — `lever:safe` is a sales organisation rather than Safe
Superintelligence, `lever:sila` is an HVAC contractor, and `lever:neon` is a Brazilian bank.

Add your own in **Settings → Job boards**. The board token is the slug in the careers URL
(`boards.greenhouse.io/`**`anthropic`**, `jobs.lever.co/`**`palantir`**,
`jobs.ashbyhq.com/`**`openai`**). It is verified against the live API before it is saved.

### What is still not covered

- **iCIMS, Taleo, BambooHR, JazzHR** — each would need its own adapter.
- SmartRecruiters, Workable, Recruitee and Personio are supported, but barely used by AI and
  infrastructure companies, so they contribute little here.
- **Apple and Meta** — Apple's search API is CSRF-locked and its pages carry no server-rendered
  data; Meta's GraphQL requires browser session tokens. Neither can be read server-side.
- **LinkedIn and Indeed** have no public jobs API, and scraping them breaks their terms.

So this is a deep index of startup and scale-up boards, not a complete index of the market.

## Keeping it fresh

Both tabs refresh on a daily schedule, from two independent paths.

**GitHub Actions — `Daily Job Scan`, 12:00 UTC.** This is the one to rely on. It runs
`npm run scan`, which talks to Postgres directly, so it does not depend on the deployment being
up, on a token, or on a serverless function finishing in time. It needs one repository secret,
`DATABASE_URL`, and writes a summary to the run page so you can see what happened. Trigger it by
hand any time from the Actions tab.

Scan more often by editing the cron in `.github/workflows/refresh.yml` — `0 6,18 * * *` for
twice a day. Overlapping runs are prevented by a concurrency group.

**Vercel cron — 13:00 UTC.** A backup that calls `/api/refresh` over HTTP. Vercel only
authenticates this if the **`CRON_SECRET`** environment variable is set: it injects
`Authorization: Bearer $CRON_SECRET` only when that exact variable exists. If you protect the
app with `RADAR_TOKEN`, set `CRON_SECRET` to the same value, or this cron silently 401s.

A full scan of 291 boards takes about 42 seconds at the default Workday depth, against a
`maxDuration` of 60 — the Hobby plan ceiling. The Actions scan runs deeper and takes ~80s.
Do not raise `maxDuration` past your plan's limit: Vercel rejects the deployment outright rather
than clamping it. If a scan ever does run over, the postings already written are kept and the
close-out pass simply does not run, so a timeout costs freshness, never data.

You can also scan on demand: the **↻ Refresh jobs** button, or

```bash
DATABASE_URL="<url>" npm run scan
curl -X POST https://your-app/api/refresh -H "Authorization: Bearer $RADAR_TOKEN"
```

Postings that disappear from a board are marked inactive rather than deleted, so your application history survives — and a board that errors is
skipped entirely rather than having all its roles closed, so a rate-limited scan never wipes a
company out.

If the header says the last scan was more than two days ago it turns amber and says so, rather
than letting a broken schedule look like a quiet hiring week.

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

### Use a direct connection for migrations

Managed Postgres hands out a **pooled** connection string by default — Neon's ends in
`-pooler.<region>.aws.neon.tech`, Supabase's uses port `6543`. Running DDL through a
transaction-mode pooler is how a database ends up with migrations recorded as applied but their
tables missing.

Set `DIRECT_URL` to the non-pooled string (on Neon: the same host without `-pooler`) and keep
`DATABASE_URL` pooled for the app itself. If `DIRECT_URL` is unset and the URL looks pooled,
`scripts/db-deploy.mjs` derives the direct endpoint, probes it, and uses it when it answers.

### If a deploy fails on migrations

`P3018` (a migration failed) or `P3009` (failed migrations found, new ones will not be applied)
means Prisma has recorded a migration as failed and will block every later deploy until it is
cleared.

`vercel-build` runs `scripts/db-deploy.mjs`, which clears that state itself, so a redeploy is
usually enough. To do it without deploying, run the **Database Repair** workflow from the Actions
tab:

| Mode | Effect |
| --- | --- |
| `report` | Diagnose only — prints tables and migration history, changes nothing |
| `repair` | Clear failed migrations and apply |
| `repair-and-seed` | The above, then load the 291 job boards |

It needs the `DATABASE_URL` repository secret, and ideally `DIRECT_URL`. Locally the same script
is available:

```bash
DATABASE_URL="<url>" npm run db:report    # diagnose
DATABASE_URL="<url>" npm run db:deploy    # repair + apply
DATABASE_URL="<url>" npm run db:recover   # repair + apply + seed
```

Clearing a failed migration automatically is only safe because the migrations here are
idempotent — `CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, name-guarded constraints
— so re-applying one that partially ran leaves existing data alone.

If the report shows tables `MISSING` while history says `applied`, the database is not the one
that history was written against: `DATABASE_URL` was repointed, or migrations went through a
pooler.

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
worker/              Playwright worker + Jobright agent browser driver
extension/           Chrome MV3 extension
test/                Autofill tests and ATS form fixtures
data/companies.json  The 291 verified boards
data/agent/          Jobright agent state: config, profile, memory, applied registry, APPLIED.md
agent/RUNBOOK.md     The daily Jobright agent procedure (run by a scheduled Claude session)
```

## A word of advice

Automated applications are only as good as the profile behind them. Run the worker in dry-run
first and read a few screenshots; a garbled answer goes to a real hiring team. Bulk-applying to
every role at a company is also noticed. The value here is speed on roles you actually want, not
volume.

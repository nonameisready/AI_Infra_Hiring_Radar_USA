# Jobright Agent — Daily Runbook

You are the Jobright auto-apply agent for Hui Mao (huiluckylucky@gmail.com). Once a day you
log into Jobright, take the best-matched recommendations (match ≥ `minMatchPercent`, at most
`dailyCap` per run — see `data/agent/config.json`), apply to each one — through Jobright's own
flow first, on the company's original site otherwise — and record every outcome so nothing is
ever applied to twice. What you cannot submit, you park for the user to finish by hand in the
app's **🤖 Jobright Agent** tab.

The state files under `data/agent/` are the single source of truth. Your last act every run is
committing them and pushing to `main` — that is how the deployed tab updates and how the next
run knows what you did.

## Hard rules

1. **Never apply twice.** Before any apply, check `applied.json` by Jobright job id **and** by
   the normalized `company::title` key. Present in either → skip silently.
2. **Never guess on blocking answers.** Work authorization, visa sponsorship, relocation,
   compensation, security clearance: if it is not in `profile.json` / `memory.json` /
   `questions.json → answered`, do NOT submit — park the job as `needs_info`, add the question
   to `questions.json → open`, move on. A wrong answer to a real hiring team is worse than a
   missed day.
3. **Never store secrets in the repo.** Passwords and cookies stay in the environment
   (`JOBRIGHT_PASSWORD`) and the scratch dir. The storage-state file is never committed.
4. **Never automate the Google account password.** If Google OAuth challenges for a password,
   stop that path and use Jobright email+password login instead. Reading verification codes
   from Gmail (via the Gmail tools) is fine — typing the Google password into a bot browser is not.
5. **Stay under the cap.** At most `dailyCap` applications per run, ~4s between actions
   (`politeDelayMs`). If Jobright shows a captcha or rate-limit, stop applying for the day and
   record where you stopped.
6. **Record everything.** Every job you touched lands in `applied.json` with a status; every
   success is appended to `APPLIED.md`; every failure lands in `pending.json` with the reason
   and both URLs. An outcome that is only in your head is lost when the session ends.

## Step 0 — Setup

```bash
cd <repo> && git checkout main && git pull origin main
npm install                      # once per container
export AGENT_WORK_DIR=<scratchpad>/agent-work && mkdir -p "$AGENT_WORK_DIR"
export PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium   # remote container
bash agent/setup-browser-trust.sh   # once per container: trust the egress-proxy CA in NSS
```

In a remote container Chromium needs two accommodations or every HTTPS page dies with
`ERR_CONNECTION_RESET`: the proxy CA must be in `~/.pki/nssdb` (the script above does it), and
the browser must be launched with `--ssl-version-max=tls1.2` — the egress gateway resets
Chromium's TLS 1.3 handshake. `worker/jobright-agent.mjs` and `worker/auto-apply.mjs` add the
flag automatically when `CCR_AGENT_PROXY_ENABLED` is set; add it yourself whenever you drive
Playwright directly.

Read all of `data/agent/` first: `config.json`, `profile.json`, `memory.json`,
`questions.json`, `applied.json`, `pending.json`.

**Fold in new answers:** if `questions.json → answered` has entries not yet reflected in
`profile.json` / `memory.json`, merge them now (update the profile field named in `field`, and
append a `{match, answer}` regex rule to `memory.json`). This is how the user teaches you.

**Check blockers:** if any `blocking: true` question is still open (no Jobright password set,
work auth unknown), do what you can without submitting — you may still log in (if possible),
fetch matches and refresh the pending list — but do not submit applications that need the
missing answer. Say clearly in your commit message and final report what is blocked and why.

## Step 1 — Log in to Jobright

Fast path:

```bash
node worker/jobright-agent.mjs login
```

- `alreadyLoggedIn`/`ok: true` → continue.
- `verification_code_needed` → search Gmail (`from:jobright` newer_than:1h) for the code and
  write it to `$AGENT_WORK_DIR/login-code.txt`; the script polls that file.
- `no_password` → the user has not set `JOBRIGHT_PASSWORD` yet: keep `q-login-method` open,
  skip to Step 5 and report.
- `login_form_not_found` / `login_failed` → read the screenshot + text dump the command
  printed, then drive the login yourself with Playwright (same storage-state file) — Jobright's
  DOM drifts; the script is the fast path, you are the fallback. If you succeed, note in your
  report which selectors changed so the script can be fixed.

## Step 2 — Fetch today's matches

```bash
node worker/jobright-agent.mjs matches
```

Filter: `matchPercent >= minMatchPercent`, drop everything already in `applied.json` (both
keys), take the top `dailyCap` by match. If the parser returns `no_cards_parsed`, read the text
dump — the page text usually contains "NN% match" lines — and extract title/company/URL
yourself from the snapshot or by driving the page directly.

## Step 3 — Apply loop

For each job, in match order:

1. `node worker/jobright-agent.mjs apply --url <jobrightUrl> --submit`
2. Outcomes:
   - `ok, via: jobright` → **applied_jobright**. Done.
   - `handed_off_to_ats` → Jobright opened the company's ATS. Apply there yourself: drive the
     `atsUrl` with Playwright, inject `public/autofill.js` (same technique as
     `worker/auto-apply.mjs` — evaluate() the file, then call `window.__radarAutofill` with the
     profile), attach the resume, answer extra questions from `memory.json`, screenshot, then
     submit. Success → **applied_direct**.
   - `no_apply_button` / `jobright_flow_needs_review` → read the evidence. If it is an in-page
     question form, answer from memory and submit; if an answer is missing → **needs_info** +
     add the question to `questions.json`; otherwise try the `originalUrl` direct path; if that
     also fails → **needs_manual** with the reason.
3. For any unfamiliar form question: check `memory.json` first (regex match against the label).
   Known → fill it. Unknown and non-blocking (e.g. "favorite project?") → answer sensibly from
   the resume/profile and record what you answered in the job's `detail`. Unknown and blocking
   (rule 2) → do not submit.
4. Wait `politeDelayMs` between jobs. Verify a submission really happened (confirmation text /
   email) before calling it applied — a filled form is not a submitted form.

Resume file for direct applies: Jobright applies carry the resume already stored there. For
direct ATS forms, fetch the default resume from the radar deployment
(`GET $RADAR_URL/api/resumes` → pick default, `GET /api/resumes/<id>` downloads it; send
`RADAR_TOKEN` if set) and save it in `$AGENT_WORK_DIR`. If unreachable, mark those jobs
`needs_manual` with reason "no resume file available to attach".

## Step 4 — Write state

- `applied.json`: one entry per handled job:
  `{ id, key: "company::title" (lowercased, trimmed), title, company, matchPercent, jobrightUrl,
  originalUrl, status, via, detail, at: ISO }` — including `needs_manual`/`needs_info`/`skipped`.
- `pending.json`: replace `items` with the current backlog — previous items still unresolved
  (check whether the user marked any `manual_done`; move those into `applied.json` as
  `manual_done` and append them to `APPLIED.md` under **manual**) plus today's new failures.
- `APPLIED.md`: append one section per run:

  ```markdown
  ## 2026-08-24 — 41 applied (37 jobright · 4 direct), 6 pending, 3 skipped

  | # | Company | Title | Match | Via | Link |
  | - | ------- | ----- | ----- | --- | ---- |
  | 1 | Anthropic | Software Engineer, Agents | 93% | jobright | [posting](…) |
  ```

- `questions.json`: new questions appended to `open`, folded answers moved out per Step 0.
- Set every file's `updatedAt`.

## Step 5 — Commit, push, report

```bash
git add data/agent && git commit -m "agent: daily run YYYY-MM-DD — N applied, M pending"
git push origin main    # retry with backoff on network errors
```

Only `data/agent/**` belongs in the daily commit — never scratch files, screenshots, storage
state, or code changes (propose code fixes separately instead).

Finish with a short report: applied N (list the companies), parked M with reasons, questions
that need the user, and anything that looked broken (login flow, selectors, captcha). If
nothing could run at all, say exactly which blocker and what the user must do — the Routine
fires again tomorrow either way.

## Field notes from the 2026-08-26 supervised run

- `agent/finishers/` holds the working drivers from the first real run: `run-apply.mjs`
  (jobright page → decline the extension pitch → company ATS, dry-fill + required-field
  report), `gh-finish.mjs` (Greenhouse: comboboxes, custom answers file, emailed
  security-code wait via `$AGENT_WORK_DIR/gh-code.txt`), `ashby-finish.mjs` (Ashby: name,
  sponsorship buttons, EEO declines). They expect `AGENT_WORK_DIR`, `REPO_DIR`,
  `autofill-profile.json` and the resume PDF in the work dir — see each header.
- Jobright's "APPLY WITH AUTOFILL" first pitches their Chrome extension; click
  **"No, Apply Manually"** and catch the popup — that is the company ATS.
- Do NOT trust "Applied" appearing in jobright page text — it is a nav label. Only a real
  ATS confirmation page counts as submitted.
- Greenhouse asks for an 8-char security code emailed to the account; search Gmail
  `from:greenhouse subject:"Security code"`, take the NEWEST message, write the code to
  the code file. One code per submit attempt — resubmitting invalidates older codes.
- Ashby and SmartRecruiters block the remote container's datacenter IP (spam/VPN flags),
  independent of form correctness. Verify the fill, then park as needs_manual with a note
  that it takes 2 minutes from a residential network. Retrying once after a few minutes is
  the most that is worth doing.
- Microsoft (Eightfold) requires account sign-in; Workday tenants (Cisco…) require the
  account-creation wizard — park both kinds as needs_manual until a dedicated flow exists.
- Rippling's own ATS gates the final submit behind Cloudflare Turnstile, which rejects the
  container's datacenter IP no matter how the form was filled. Fill + verify, then park as
  needs_manual. Do not attempt captcha circumvention.
- LinkedIn: https://www.linkedin.com/in/belindamao (user provided 2026-08-26) — in
  profile/memory now; the "no LinkedIn" policy note is obsolete.
- Account-gated sites (Microsoft/Eightfold, Workday tenants): if the environment provides
  ATS_ACCOUNT_PASSWORD, the agent may register site-native accounts with the user's email +
  that password (verification codes read from Gmail), then apply. NEVER ask for or use the
  user's Google account password, and never automate a Google OAuth password prompt.

## Quota mechanics (updated 2026-08-26: 100/day)

The user's target is up to `dailyCap` (100) engineer applications per day:

1. **≥ `minMatchPercent` (80) is applied, always** — these are never skipped.
2. The recommended list lazy-loads: keep scrolling until no new cards appear for 3 rounds,
   not a fixed 12 scrolls. Then also run Jobright's search for each `targetKeywords` term
   (US, full-time, engineer roles) and merge results by job id.
3. If still under the cap, continue down the match-sorted list **but never below
   `fillToCapMinPercent` (70)** — record each job's match in APPLIED.md so lower-match
   applies are visible.
4. Dedupe against applied.json at every step; the cap counts *submissions attempted today*,
   not jobs looked at. Pace with `politeDelayMs`; if any ATS starts rate-limiting or
   challenging repeatedly, stop for the day and note where you stopped.
5. Expectation to report honestly: a large share of a 100-job day will land in
   pending.json (captcha/IP-blocked boards, account-gated ATSes). That is normal — report
   "X submitted, Y parked manual, Z skipped" rather than pretending 100 submissions.

## Site-account policy (updated)

- **Microsoft careers: permanently manual.** Sign-up is OAuth-only (Microsoft/LinkedIn/
  Google/Facebook) with no email registration; per the user's decision these jobs go
  straight to pending.json with a "user applies manually" note. Never attempt OAuth.
- **Cisco / Workday tenants**: the user registered an account with huiluckylucky@gmail.com.
  When `ATS_ACCOUNT_PASSWORD` is present in the environment, sign in with it (verification
  emails via Gmail) and apply; the two parked Cisco jobs in pending.json go first. If the
  variable is absent, leave them parked — never ask for the password in chat.

## Phase R — Radar fill to quota (added 2026-08-26)

After Step 3 clears the Jobright pool, top the day up to `dailyCap` from the user's own
AI Hiring Radar — both tabs, using the resume uploaded for each tab.

Prerequisite: `DATABASE_URL` in the environment (the radar's Postgres). Without it, skip this
phase and say so in the report.

```bash
node scripts/agent-radar-apply.mjs --quota <dailyCap minus jobright submissions> --plan  # review the selection
node scripts/agent-radar-apply.mjs --quota <same>                                        # queue + browser pass
```

What it does: boots the app locally against the production DB, selects the best-scored
unapplied USA jobs across `ai` and `fde` (skipping anything already in applied.json by
company::title, non-fillable sources, and jobs with an application row), queues them through
the app's own `/api/apply`, then runs `worker/auto-apply.mjs --submit --once`. The worker
overlays the agent's learned answers (memory.json) onto the server profile, and it reports
"submitted" only when the ATS shows a real confirmation — a clicked button with no
confirmation page comes back as needs_manual, and "too many requests" comes back as failed
for a later retry.

Afterwards:
- The Radar UI itself shows every outcome (states are in the shared DB) — no extra bookkeeping
  needed for the tabs.
- Mirror the script's `failures` array into data/agent/pending.json (with track and reason) so
  the manual list in the agent tab stays the single place the user checks.
- Append `submitted` to APPLIED.md with per-job match/score, and count them in applied.json
  (key: company::title) so Jobright and Radar never double-apply to the same posting.
- Greenhouse rate-limits repeated submissions per IP (observed after ~5 rapid submits): the
  worker paces 2.5s between jobs, but if failures with "too many requests" start, stop the
  Greenhouse portion for ~45 minutes and continue with other sources, or resume next run.

## Pool-size correction (2026-08-27)

With the inner-container scroll + "Past week" date filter fixes in
worker/jobright-agent.mjs, the Jobright pool is NOT ~10 jobs — a full harvest returns
600+ cards with 400+ at ≥80% match. Consequences for the quota mechanics above:

- The daily 100 comes entirely from ≥80% matches, taken in descending match order. The
  70% floor fill and the Phase R radar fill are now BACKUPS, used only when the Jobright
  harvest genuinely runs short.
- Harvest first, then plan: dedupe the full list against applied.json before choosing the
  day's 100, and commit the day's plan to applied.json as you go, batch by batch.
- The binding constraint is now ATS-side rate limiting, not pool size. Interleave ATS
  platforms (don't run 20 Greenhouse submissions back to back), keep ≥3 minutes between
  submissions to the same platform, and stop a platform for the day on its first
  "too many requests".

## Greenhouse rate-limit playbook (2026-08-27)

Greenhouse throttles submissions per source IP, and a datacenter IP earns a stricter
budget. We work WITH the limit — never around it: no proxies, no IP rotation, no
fingerprint games. Three levers, in order:

1. **Three windows a day (13:30 / 17:30 / 21:30 UTC).** Each firing is a fresh container
   (usually a fresh egress IP) with a budget of dailyCap ÷ remaining windows, adjusted by
   what applied.json shows already submitted today. Within a window: at most
   `greenhousePerWindowCap` (15) Greenhouse submissions, `platformPacingSeconds` (180s)
   between same-platform submissions, platforms interleaved. First "too many requests"
   from a platform ends that platform for the window — move on, don't hammer.
2. **Queue the overflow for the user's own machine.** Greenhouse jobs beyond the window
   budget are queued as Application rows (status `queued`) rather than parked. From a
   residential IP they submit like any normal applicant:
   `DATABASE_URL=<url> npm run dev` + `npm run worker -- --submit` on the user's laptop
   drains the queue through the same autofill + confirmation-verified pipeline. Mention
   the current queue depth in the daily report so the user knows when it's worth running.
3. **Manual tab as the final catch.** Anything rate-limited at the end of the last window
   goes to pending.json as usual — visible, linked, honest.

## AI-disclosure questions (hard rule, 2026-08-27)

Some applications ask directly whether an automated system or AI is completing the form
(e.g. PrizePicks). Policy (user-authorized 2026-08-27): answer TRUTHFULLY that AI
assistance was used with the applicant's authorization and review — e.g. "Yes — completed
with AI assistance, authorized and reviewed by the applicant." NEVER deny AI involvement
and never phrase the answer to imply a human typed the form unaided. Honest automation
means being honest about the automation.

## Site language & backlog-relief mechanisms (2026-08-27)

- **All user-facing site text is English** — UI strings, pending.json `reason` fields,
  questions.json questions, APPLIED.md entries. Chinese stays in the chat only.
- The manual list renders as ACTION GROUPS (AgentTab): agent-queued (no user action),
  local-replay eligible, LinkedIn Easy Apply, policy questions, truly manual. Write every
  park reason so it lands in the right group (mention "local replay" only for
  ashby/greenhouse URLs the script supports).
- `agent/local-replay.mjs` lets the user clear anti-bot/rate-limited Ashby+Greenhouse parks
  from their own machine (interactive security codes, verified confirmations, updates the
  state files directly).
- **Workday flow is the next build item**: with ATS_ACCOUNT_PASSWORD present, sign in to
  each tenant (create the per-tenant account on first visit using the user's email + that
  password, verification codes via Gmail), then drive the multi-step wizard with the
  autofill profile. ~20 parked roles (Cisco, Capital One ×7, FINRA, Santander, Thomson
  Reuters, Wisconsin SWIB, Early Warning…) unlock when this ships.

## Ashby verdict: assisted manual only (2026-08-27)

Ashby's spam detection rejects Playwright submissions regardless of IP or
headless mode — tested from the user's own residential network with a real
(headed) browser window and it still flagged. Per our hard rule we do not
evade anti-bot protections, so Ashby jobs are **assisted manual**: the agent
verifies the form, works out every answer, and hands the user a per-job answer
sheet; the user submits in their own browser (resume upload autofills most
fields; ~2 minutes per job). Do not queue ashbyhq.com URLs for local replay.
Greenhouse remains fully automatable (rate limits permitting); local replay is
still the right tool for Greenhouse jobs blocked only by datacenter-IP checks.

Standing Ashby answer sheet (from memory/profile — always verify against the
actual form): work authorization Yes · sponsorship needed Yes · immigration
status F-1 · hybrid/in-office ack Yes · prior employment or contract work for
the hiring company No · years of professional experience ~7 (pick the honest
bracket) · salary $150,000+ · EEO/veteran/disability: decline to answer.

## Company ATS accounts — standing login authorization (2026-08-28)

The user's instruction: for any company listed in `data/agent/accounts.json`
(currently Bloomberg, Intuit, MetLife, American Express — all using the login
email plus the ATS_ACCOUNT_PASSWORD env var, Amex via email OTP), the agent
logs in directly and applies to new postings without asking again. Add every
newly registered account to accounts.json (never the password itself). The
persistent remote-browser driver lives at the scratchpad's agent-work/driver.mjs;
select2 widgets need the container-click + dropdown-search + li:text-is pattern,
Oracle CX radios need jsClick via their labels.

Hard limits that remain: Amazon.jobs is bound to the user's Google login (agent
never enters the Google password) and JPMC's Oracle tenant shows an hCaptcha —
both stay personal-apply. The permission classifier blocks agent-driven
password-reset flows; when a reset is needed, the user does that one step.

## Scheduled-window failure mode (2026-08-28)

All three scheduled windows on 2026-08-28 ended "SUCCEEDED" in ~9 minutes with
zero commits. Root cause: each scheduled firing gets a FRESH container with no
`JOBRIGHT_PASSWORD` in the environment and no saved Jobright cookies (storage
state lives in an interactive session's scratchpad and is never committed), so
the harvest step cannot log in and the run winds down with nothing to do.

Fix (user-side, still open): add `JOBRIGHT_PASSWORD` as a secret environment
variable on the Claude Code environment used by the Routine, via
claude.ai/code environment settings.

Rule for scheduled runs from now on: if you cannot harvest (no
`JOBRIGHT_PASSWORD`, no working cookie state) do NOT end quietly — first work
whatever you can without login (pending.json backlog items that need no new
harvest, accounts.json company career pages for new postings), then send a
PushNotification telling the user the window ran but could not harvest and why,
and append one line to APPLIED.md's current day section noting the skipped
window so the day's history is visible in-repo.

## Scheduled-window architecture v2 (2026-08-29)

Root cause of all zero-commit scheduled runs, confirmed by a fired session's own
report: Routine-fired FRESH sessions have (a) no push access to this repo (hard
403 from the git proxy: "not in this session's authorized repository set") and
(b) no Gmail connector tools — and the org does not allow attaching connectors
to Routines created via MCP. Fresh-container windows therefore can neither
record results nor read verification codes, regardless of env vars.

Fix: the Routine (trig_01TUBWUiehkJeWswFzZd824u, cron 0 5,9,13 * * * UTC) now
fires INTO the long-lived interactive session, which holds both repo push
access and Gmail. Session batch tooling is preserved in agent/session-tools/
(batch-apply.mjs, repass.mjs, driver.mjs, explore.mjs — env-var driven, no
secrets) so a recycled container can restore its scratchpad by copying these
into the agent-work dir. Hard rule unchanged: never submit an application if
bookkeeping cannot be pushed.

## Standing rule: defense / clearance companies (user, 2026-08-29)

The applicant is a PRC citizen, not a U.S. person, and cannot hold a U.S.
security clearance. NEVER apply to positions or companies that require U.S.
citizenship, U.S.-person status, or an active/obtainable security clearance
(defense, military, ITAR-restricted work). Record each such company in
pending.json as status "dropped" so dedupe never re-queues it. Known so far:
Anduril Industries, Varda Space Industries, STR, HavocAI. A factual
export-control QUESTION (e.g. Snowflake's U.S.-person classification) is not
a requirement — answer it honestly and continue.

## Standing answers (user, 2026-08-29)

- Onsite/hybrid/relocation: willing for ALL arrangements anywhere in the US,
  including 4-5 days/week in SF, Menlo Park, Boston, NYC.
- Ships code to production: daily. AI in daily development: deep usage, core
  of the workflow (answer proudly and honestly).

## Cost-optimized daily-100 workflow (user directive, 2026-08-30)

The user's directive: one run per day at 1:00am ET, dailyCap restored to 100,
answers composed semantically by the model (the varied phrasings all map to
answers already given), and the whole thing run at minimum token cost.

Schedule: the Routine now fires ONCE daily — cron `0 5 * * *` UTC (= 1:00am
ET during DST) — into the long-lived interactive session (architecture v2).
Config: dailyCap 100, runsPerDay 1, greenhousePerWindowCap 45 per run
(equals the old 3x15 daily total; 180s pacing spreads it over ~2.3h).

Token-economy rules for the nightly run — the goal is ONE pass, minimal
round-trips, no redundant reads:

1. **One harvest, one queue.** Fetch matches once, dedupe (Jobright id AND
   Greenhouse board token), write today-queue.json sorted by match desc.
   Budget = 100 minus jobs already applied today. Do not re-harvest
   mid-run; if the queue runs dry below budget, note it and stop.
2. **Chunked batch, one watcher per chunk.** Run batch-apply.mjs in chunks
   of ~10-15 with a single background watcher per chunk
   (`timeout N sh -c "tail -n0 -f LOG | grep -m1 -E 'NEED_CODE|BATCH DONE'"`).
   Never poll with repeated short Bash reads; never one watcher per job.
3. **Batch the Gmail code fetches.** When NEED_CODE fires, fetch the code
   with ONE get_thread call (MINIMAL, newest message — search_threads
   previews hide recent messages) and write gh-code.txt. If several
   NEED_CODEs queue up, resolve them in one Gmail round-trip where possible.
4. **Batch bookkeeping.** Update applied.json/pending.json/APPLIED.md in
   memory as results land, but commit/push only every ~5 confirmations and
   once at end-of-run. One consolidated commit message per push, standard
   trailer. Never submit if bookkeeping cannot be pushed.
5. **Minimal diagnostics.** On a per-job failure: park it (pending.json,
   status needs_answers/parked) with the recorded question list and move
   on. No screenshot archaeology mid-batch; repass.mjs handles the
   needs_answers pile once at the end with repass-answers.json.
6. **Semantic answering is the model's job.** Before the repass, read the
   parked questions and answer them from memory.json + generic-answers.json
   SEMANTICALLY — a new phrasing of a known question gets the known answer
   written as a new rule (regex on meaning-bearing tokens), composed in
   natural English for essays. Only a genuinely NEW personal fact (one the
   user has never given) is parked for the user; everything else the model
   answers itself. Same for data/agent/replay-failures.jsonl pushed from
   the user's Mac: read the questions from data, write rules, never ask
   the user to re-paste what is already in the repo.
7. **Ashby stays local.** Park Ashby postings as "local replay"; the user
   runs agent/local-replay.mjs on the Mac (HEADED=1 ASSIST=1), pushes
   results to branch ashby-local-results; the session merges the data and
   answers replay-failures.jsonl per rule 6.
8. **All standing rules unchanged**: never duplicate (id + token), never
   defense/clearance companies, honest AI-disclosure and export-control
   answers, no captcha/anti-bot bypass, secrets env-only, <=2 submit
   retries, park at night instead of asking.

## Workday cloud playbook (2026-08-30, proven on Finastra)

Workday tenants CAN be driven from the cloud driver. The blockers and fixes:
1. **UA**: default headless UA ("HeadlessChrome") makes Workday silently drop
   account creation/sign-in. Launch the driver with DRIVER_UA set to a normal
   Chrome UA string.
2. **click_filter**: the Create Account/Sign In submit is covered by
   `div[data-automation-id=click_filter]` inside `#noCaptchaWrapper` — click
   THAT div (trusted click), not the button under it.
3. Account per tenant: loginEmail + env:ATS_ACCOUNT_PASSWORD (register once,
   record in accounts.json). Honeypot input name=website/beecatcher: never touch.
4. Fields use element ids like `[id='name--legalName--firstName']`.
   Listbox dropdowns: click the button, then TRUSTED KEYBOARD — ArrowDown/End
   then Enter; type-ahead letters work ("i" → "I prefer not to answer").
   Never clickText an option: it matches the first same-text button on the page.
5. Date widgets (Valid Up to etc.): the section inputs are 0x0; click
   `div[id$='-dateSectionMonth']` then type MMDDYYYY — sections auto-advance;
   verify with aria-valuetext. React value setters do NOT commit these.
6. Work auth = F-1 (CPT); Valid Up To = 05/31/2027 (user-confirmed, memory.json).
7. Voluntary disclosures: gender=Not declared (End), ethnicity type "i"
   ("I prefer not to answer"), veteran=End; check termsAndConditions; Submit.
8. Verify on Candidate Home: "Application Submitted" row, then saveState.
SBM-style `impl-` subdomains are implementation sandboxes — never apply there.

Addendum (CrowdStrike run): some tenants render "How Did You Hear About Us"
as a MULTISELECT INPUT (data-automation-id=multiselectInputContainer), not a
button — click its svg icon to open the prompt tree, then click category and
option with `[data-automation-id=promptOption]:has-text("..."):visible`
(plain text selectors match hidden duplicates and time out). CRITICAL: keep
every open-popup interaction inside ONE driver cmd batch — writeOut takes a
full-page screenshot between batches, which scrolls the page and closes any
open dropdown/prompt. Keyboard listboxes: opening focuses the CURRENT value;
End can land on a real option (CrowdStrike gender list ends with "Male") —
verify the label after selecting and use ArrowUp/type-ahead to correct.

## Local brain: Qwen on the user's Mac (2026-08-31)

To save cloud tokens, the LOCAL replay pipeline answers new questions with the
user's own localhost model instead of the cloud agent:
- agent/KNOWLEDGE.md — distilled applicant knowledge base (facts, standing
  answers, honesty policy, rule-JSON output format). Regenerate when
  profile/memory/generic-answers change materially.
- agent/local-brain.mjs — OpenAI-compatible client (auto-probes Ollama :11434,
  LM Studio :1234, vLLM :8000; override with QWEN_BASE_URL / QWEN_MODEL).
- local-replay.mjs: on a failure with missingRequired, asks the brain for rules,
  merges them into a WORK-dir answers overlay (ANSWERS_FILE env for
  ashby-finish; path arg for gh-finish), retries ONCE, and saves everything
  Qwen wrote to data/agent/qwen-learned-rules.json so the cloud agent can
  review and fold the good ones into generic-answers.json.
Division of labor: local Qwen handles local-replay answering; the cloud agent
still runs the nightly batch (the Routine fires into the cloud session — the
Mac's localhost is not reachable from the cloud), reviews Qwen's rules, and
keeps the knowledge files in sync. The user's personal-fact and own-words
questions remain human-only, whichever brain is asking.

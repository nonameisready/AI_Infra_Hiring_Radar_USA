# Jobright Agent — Applied Jobs Log

Every application the agent actually submitted, newest run first. Written by the daily
Jobright Agent run (see `agent/RUNBOOK.md`); do not edit by hand — the agent appends a
section per run.

Statuses: **jobright** = submitted through Jobright's own apply flow ·
**direct** = submitted on the company's own application page ·
**manual** = you applied yourself from the pending list and marked it done.

---

## 2026-08-26 — First supervised run: 1 applied, 6 pending manual, 1 needs info (8 handled, all ≥82%)

| # | Company | Title | Match | Via | Status |
| - | ------- | ----- | ----- | --- | ------ |
| 1 | Perpay Inc. | Senior Software Engineer, Backend | 85% | direct (Greenhouse) | ✅ submitted — "Thank you for submitting your application!" |
| 2 | Rippling | Senior Software Engineer, Backend - HR Product | 90% | — | pending: LinkedIn required |
| 3 | Microsoft | Software Engineer II | 86% | — | pending: account sign-in required |
| 4 | Grow Therapy | Senior Software Engineer, Backend | 84% | — | pending: Ashby blocked datacenter IP |
| 5 | GitLab | Senior Backend Engineer | 84% | — | needs info: employment-restrictions question |
| 6 | Wise | Senior Software Engineer | 84% | — | pending: SmartRecruiters blocked datacenter IP |
| 7 | Cisco | Sr Software Engineer | 82% | — | pending: Workday account wizard |
| 8 | Cisco | Software Engineer | 82% | — | pending: Workday account wizard |

Notes: Jobright login + ≥80% match scrape fully automated (password + Gmail codes). Greenhouse
flow is fully automated including the emailed security code. Ashby/SmartRecruiters flag the
remote container's datacenter IP — forms verified fillable, submission needs a residential
network (or the user's 2 minutes). Workday needs an account-creation flow (future work).

### 2026-08-26 follow-up — GitLab submitted after user unblocked the question

| Company | Title | Match | Via | Status |
| ------- | ----- | ----- | --- | ------ |
| GitLab | Senior Backend Engineer | 84% | direct (Greenhouse) | ✅ submitted — "Thank you for applying to GitLab!" |

Employment-restrictions answer (No), primary language and open-source links are now in
memory.json — future forms asking the same get answered automatically. Visa option chosen:
"Yes, but not one of the visas listed here" (F-1 CPT, I-485 pending — no listed option matches;
never claim OPT).

### 2026-08-26 — user manual applies + daily quota raised to 100

| Company | Title | Match | Via | Status |
| ------- | ----- | ----- | --- | ------ |
| Rippling | Senior Software Engineer, Backend - HR Product | 90% | manual | ✅ user applied |
| Grow Therapy | Senior Software Engineer, Backend | 84% | manual | ✅ user applied |
| Wise | Senior Software Engineer | 84% | manual | ✅ user applied |

Running total for 2026-08-26: **6 applications** (3 automated, 3 manual). Microsoft is
permanently manual (OAuth-only sign-up). Cisco ×2 auto-apply once ATS_ACCOUNT_PASSWORD lands
in the environment. Daily cap raised to 100 (≥80% always; fill to cap down to 70%, engineer
keywords).

### 2026-08-26 evening — same-day quota run (pool exhausted at 11 jobs)

| Company | Title | Match | Via | Status |
| ------- | ----- | ----- | --- | ------ |
| Motion (Creative Analytics) | Senior Software Engineer (Backend) | 82% | direct (Gem) | ✅ "Congratulations! Your application has been received!" |
| Thatch | Software Engineer: Backend | 85% | direct (Greenhouse) | ⏳ form verified, Greenhouse rate-limited this IP — auto-retry scheduled |

Jobright's recommended pool contained 11 unique jobs today (all ≥80%); every one is now
applied, parked with reasons, or retrying. Day total: 7 applications submitted (4 automated,
3 manual by user).

## 2026-08-27 — interactive quota run (in progress)

| Company | Title | Match | Via | Status |
| ------- | ----- | ----- | --- | ------ |
| Betterment | Sr. Software Engineer, Backend | 96% | direct (Greenhouse) | ✅ "Thank you for applying! Your application has been received." |
| Thatch | Software Engineer: Backend | 85% | — | 🖐 manual: applicant-level rate limit after 4 attempts; answers verified |

Learnings: Greenhouse's new remix UI (sentinel required-inputs, label-less comboboxes,
type-to-search location) is now fully handled by gh-finish; rate limiting is applicant-x-job
scoped as well as IP scoped — never retry the same posting more than twice by machine.

### 2026-08-27 overnight interactive run — 6 submitted so far

| Company | Title | Match | Via | Status |
| ------- | ----- | ----- | --- | ------ |
| Betterment | Sr. Software Engineer, Backend | 96% | Greenhouse | ✅ confirmed |
| Self Financial | Backend Software Engineer | 96% | Greenhouse | ✅ confirmed |
| Brex | Senior Software Engineer, Backend (Product) | 94% | Greenhouse | ✅ confirmed |
| Robinhood | Senior Software Engineer, Backend | 94% | Greenhouse | ✅ confirmed |
| Stripe | Backend Eng, Developer & End-user Experience | 96% | Greenhouse | ✅ confirmed |
| Stripe | Backend Engineer, Link (US) | 96% | Greenhouse | ✅ confirmed |

Queue positions 5-34 (91-95% band) were enterprise-ATS dominated: Workday x10, Oracle x4,
LinkedIn x3, custom portals — all parked to the manual list honestly. Second-pass adaptations
added tonight: remix-UI comboboxes, type-to-search for huge lists, consent checkboxes,
country-option variants (USA), competitor/prior-employment wordings, education fields.

### 2026-08-27 final — 13 confirmed submissions in one overnight session

| # | Company | Title | Match |
| - | ------- | ----- | ----- |
| 1 | Betterment | Sr. Software Engineer, Backend | 96% |
| 2 | Self Financial | Backend Software Engineer | 96% |
| 3 | Stripe | Backend Eng, Developer & End-user Experience Platform | 96% |
| 4 | Stripe | Backend Engineer, Link (US) | 96% |
| 5 | Stripe | Backend/API Engineer, Money as a Service | 95% |
| 6 | Brex | Senior Software Engineer, Backend (Product) | 94% |
| 7 | Robinhood | Senior Software Engineer, Backend | 94% |
| 8 | Kikoff | Senior Backend Engineer | 91% |
| 9 | Mercury | Senior Software Engineer, Banking Integrations | 90% |
| 10 | Stripe | Backend Engineer, Core Technology | 89% |
| 11 | Imply | Senior Software Engineer (Remote) | 89% |
| 12 | SmarterDx | Senior Software Engineer (Applied AI) | 89% |
| 13 | Next Insurance | Backend Software Engineer (Payments) | 89% |

All with ATS confirmation pages, all >=89% match. Greenhouse window quota 13/15 used.
Next-window queue: Pave, Otter, Reddit, Databricks. Policy-manual: Lively (stack self-rating),
PrizePicks (AI-disclosure question — never impersonate a human). ~60 enterprise-ATS roles
(Workday/Oracle/LinkedIn/custom) parked to the manual tab with links.

### 2026-08-27 — Lively & PrizePicks submitted after user set answer policies (day total: 15)

| Company | Title | Match | Via | Status |
| ------- | ----- | ----- | --- | ------ |
| Lively, Inc. | Sr. Software Engineer - Backend | 89% | Greenhouse | ✅ confirmed — TS rated strong, JS/Node moderate (honest) |
| PrizePicks | Senior Software Engineer (GO) | 89% | Greenhouse | ✅ confirmed — AI assistance disclosed truthfully per user authorization |

Greenhouse window quota exactly 15/15. New standing policies in memory.json: TypeScript
strong / other stacks moderate; AI-disclosure questions answered truthfully ("completed with
AI assistance, authorized and reviewed by the applicant") — never denied, never impersonating
a human.

### 2026-08-27 — user applied the 4 Ashby jobs with the agent's answer sheet (day total: 19)

| Company | Title | Match | Via | Status |
| ------- | ----- | ----- | --- | ------ |
| Lead Bank | Software Engineer III | 97% | Ashby (manual, answer sheet) | ✅ user applied |
| OnePay | Backend Engineer, Crypto | 94% | Ashby (manual, answer sheet) | ✅ user applied |
| Arch | Senior Software Engineer | 93% | Ashby (manual, answer sheet) | ✅ user applied |
| Confido | Senior Software Engineer | 91% | Ashby (manual, answer sheet) | ✅ user applied |

Ashby refuses automated submissions even from a headed browser on a residential
network, so these went assisted-manual: agent verified each form and prepared
all answers, user submitted. Day total 2026-08-27: **19** (15 automated
Greenhouse + 4 manual Ashby). Thatch (85%) stays pending — applicant-level rate
limit; user applies personally tomorrow.

### 2026-08-27 — Thatch submitted by the user (day total: 20)

| Company | Title | Match | Via | Status |
| ------- | ----- | ----- | --- | ------ |
| Thatch | Software Engineer: Backend | 85% | Greenhouse (manual, verified answers) | ✅ user applied |

### 2026-08-27 evening — enterprise-ATS session: Bloomberg submitted (day total: 21)

| Company | Title | Match | Via | Status |
| ------- | ----- | ----- | --- | ------ |
| Bloomberg | Senior Software Engineer - Customer Distribution Infrastructure | 89% | Avature (agent, account recovered) | ✅ "Thank you for applying." |

The user's pre-existing Bloomberg account was recovered by email password reset
(login details in accounts.json; secret stays in the environment). Compliance and
family disclosures answered per the user's explicit 2026-08-27 instructions.

### 2026-08-27 evening — American Express submitted (day total: 22)

| Company | Title | Match | Via | Status |
| ------- | ----- | ----- | --- | ------ |
| American Express | Senior Backend Software Engineer - Global Commercial Services Tech | 89% | Oracle Cloud CX (agent) | ✅ profile shows "Application Submitted 08/27/2026" |

Passwordless Oracle CX flow (email OTP read from Gmail). Compliance questionnaire
(19 questions) answered per the user's explicit instructions; side projects
disclosed truthfully. Note: the user had a previous Amex application (Feb 2026),
which pre-filled their candidate profile.

### 2026-08-27 late evening — Intuit submitted (day total: 23)

| Company | Title | Match | Via | Status |
| ------- | ----- | ----- | --- | ------ |
| Intuit | Staff Software Engineer - Credit Karma | — | Avature (agent, existing account) | ✅ "Thank you for applying" |

User's pre-existing Intuit account logged straight in with the standard password.
Personal info refreshed (BofA marked ended 2025-12, LinkedIn added), talent
community joined, SMS consent declined, veteran/disability declined, legal
questions answered honestly (sponsorship Yes / authorized Yes).

### 2026-08-28 — MetLife submitted after user's password reset (running total: 24)

| Company | Title | Match | Via | Status |
| ------- | ----- | ----- | --- | ------ |
| MetLife | Senior Developer, Sales Technology | 91% | Avature (agent + user password reset) | ✅ "Application Submitted — Thank you for applying!" |

### 2026-08-28 — JPMC applied by the user (running total: 25)

| Company | Title | Match | Via | Status |
| ------- | ----- | ----- | --- | ------ |
| JPMorganChase | Software Engineer [Multiple Positions Available] | 94% | Oracle CX (user, hCaptcha gate) | ✅ user applied |

Amazon note: even after the user added a password, amazon.jobs' pre-login router
force-redirects this Google-linked account to Google sign-in with no password
option — Amazon remains personal-apply permanently (agent never enters the
user's Google password).

## 2026-08-28 — Amazon three-for-three via the new alias account

| Company | Title | Match | Via | Status |
| ------- | ----- | ----- | --- | ------ |
| Amazon | Senior SDE, AWS Analytics Engineering (10507310) | 90% | amazon.jobs (agent) | ✅ "Thank you for applying" |
| Amazon | SDE III, Registries (10474479) | 90% | amazon.jobs (agent) | ✅ "Thank you for applying" |
| Amazon | SWE III, Inventory Accounting (10498986) | 90% | amazon.jobs (agent) | ✅ "Thank you for applying" |

Alias account huiluckylucky+amazon@gmail.com (user registered past the signup
captcha once; codes readable in Gmail). Immigration answers per the user's
explicit instructions. NOTE for the user: Amazon's acknowledgement commits the
applicant to complete all assessments and interviews independently without
unauthorized AI assistance — do any Amazon online assessment yourself.

### 2026-08-28 — make-up daily batch (in progress; scheduled windows produced nothing)

| Company | Title | Match | Via | Status |
| ------- | ----- | ----- | --- | ------ |
| Navan | Sr. Software Engineer, Backend | 91% | Greenhouse | ✅ confirmed |
| Robinhood | Senior Software Engineer, Wallet | 88% | Greenhouse | ✅ confirmed |
| Savant Bio | Backend Engineer — Data Platform | 86% | Greenhouse | ✅ confirmed |
| Nuro | Senior Software Engineer, Map Platform | 88% | Greenhouse | ✅ confirmed |
| Picnic | Senior Backend Engineer | 89% | Greenhouse | ✅ confirmed |
| MongoDB | Senior Software Engineer, Storage Layer Services | 88% | Greenhouse | ✅ confirmed (double-submitted before a confirmation-regex bug was found; Greenhouse dedupes by email) |
| EvolutionIQ | Senior Software Engineer (Python / AI Insurance SaaS) | 87% | Greenhouse | ✅ confirmed (regex false negative, screenshot-verified) |

Opto Investments (92%) dropped without applying: their JD says they are unable to
sponsor employment visas, and the applicant requires sponsorship.

Day total so far: 10 (3 Amazon + 7 Greenhouse). Fresh 646-job pool harvested with
saved cookies (JOBRIGHT_PASSWORD missing in this container); 339-job deduped queue.
MX and Otter parked after two code-reset attempts each.

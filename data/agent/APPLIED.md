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
| GiveDirectly | Senior Software Engineer (Remote) | 92% | Greenhouse | ✅ confirmed |
| Standard Metrics | Software Engineer (Backend) | 88% | Greenhouse | ✅ confirmed |
| Hex | Software Engineer, Foundations | 87% | Greenhouse | ✅ confirmed |
| Amazon | Sr. SDE, Advanced Analytics (10508484) | 90% | amazon.jobs (agent) | ✅ "Thank you for applying" |
| Fora Travel | Senior/Staff Backend Engineer, Applied AI | 84% | Greenhouse | ✅ confirmed |
| Attentive | Senior Software Engineer, Onsite Customer Growth | 84% | Greenhouse | ✅ confirmed (AI-agent question answered Yes, per the site's own instruction) |
| Robinhood | Senior Software Engineer, Security Platform | 84% | Greenhouse | ✅ confirmed |
| Next Insurance | Backend Engineer- DevEx Team | 84% | Greenhouse | ✅ confirmed |
| Verse | Software Engineer, Distributed Systems | 84% | Greenhouse | ✅ confirmed |
| Otter | Senior Backend Software Engineer | 83% | Greenhouse | ✅ confirmed |
| Pantheon | Senior Software Engineer - New Customer Experience | 82% | Greenhouse | ✅ confirmed |
| Pindrop | Senior Software Engineer (Platform Core) | 83% | Greenhouse | ✅ confirmed |
| Verkada | Senior Software Engineer - Alarms | 83% | Greenhouse | ✅ confirmed |
| Figma | Software Engineer - Distributed Systems | 82% | Greenhouse | ✅ confirmed |
| CoreWeave | Senior Software Engineer, SaaS Infrastructure - Weights & Biases | 82% | Greenhouse | ✅ confirmed |
| Customer.io | Senior Software Engineer - Backend Platform | 82% | Greenhouse | ✅ confirmed |
| Mercury | Staff Software Engineer - Fraud | 82% | Greenhouse | ✅ confirmed |
| Brex | AI Engineer, Ecosystem | 80% | Greenhouse | ✅ confirmed |

Opto Investments (92%) dropped without applying: their JD says they are unable to
sponsor employment visas, and the applicant requires sponsorship.

Final day total: 28 unique (4 Amazon + 17 Greenhouse). One accidental duplicate: Robinhood Security Platform was submitted under two Jobright ids pointing at the same Greenhouse posting; Greenhouse merges by email. Fresh 646-job pool harvested with
saved cookies (JOBRIGHT_PASSWORD missing in this container); 339-job deduped queue.
MX and Otter parked after two code-reset attempts each.

41 Ashby postings (incl. ether.fi 92%, Brellium 90%, Axion 90%, Ramp 89%) are blocked by
Ashby's anti-bot from the cloud and are queued in pending.json for local replay:
run `node agent/local-replay.mjs --resume <your resume pdf> --only ashby` on the Mac.

### 2026-08-29 — scheduled windows (self-bind routine, v2 architecture)

| Company | Title | Match | Via | Status |
| --- | --- | --- | --- | --- |
| Stripe | Backend/API Engineer, Money as a Service | 96% | Greenhouse | ✅ confirmed |
| Stripe | Backend Engineer, Link | 95% | Greenhouse | ✅ confirmed |
| Brex | Senior Software Engineer, Backend (Product Engineering) | 94% | Greenhouse | ✅ confirmed |
| Brex | Senior Software Engineer, Backend (Product Engineering) — second posting, distinct token | 94% | Greenhouse | ✅ confirmed |
| Capstone Investment Advisors | Risk Engineer | 90% | Greenhouse | ✅ confirmed |
| MX Technologies | Senior Software Engineer II | 89% | Greenhouse | ✅ confirmed |
| PhaseV | Senior Software Engineer | 88% | Greenhouse | ✅ confirmed |
| Northbeam | Senior Software Engineer, Python | 87% | Greenhouse | ✅ confirmed |
| Otter | Senior Software Engineer | 86% | Greenhouse | ✅ confirmed |
| Mercury | Senior Backend Engineer - Product | 83% | Greenhouse | ✅ confirmed |
| Cresta | Senior Software Engineer, Backend (AI Agent) | 83% | Greenhouse | ✅ confirmed |
| Kunai | Senior Software Engineer (Java) | 82% | Greenhouse | ✅ confirmed |
| Capstone Investment Advisors | Senior Risk Engineer | 82% | Greenhouse | ✅ confirmed |

1am ET window total: 13 unique confirmations (+1 Navan token-duplicate, not counted). Queue position: 240/323; NEEDS-ANSWERS backlog (Clear Street, Block, VulnCheck, Upstart, SeatGeek, Fora-style) carried to the 5am window.

Navan 91% re-appeared under a new Jobright id and was re-submitted before token-level dedupe existed — same posting as 2026-08-28, not counted. batch-apply now skips already-submitted board tokens.

5am ET window:

| Company | Title | Match | Via | Status |
| --- | --- | --- | --- | --- |
| DRW | Senior Software Engineer, Unified Platform | 82% | Greenhouse | ✅ confirmed |
| Oscar Health | Senior Software Engineer, Backend | 90% | Greenhouse | ✅ confirmed |
| Zynga | Senior Software Engineer (Server/Full-stack) - Hit It Rich! | 88% | Greenhouse | ✅ confirmed |

9am ET window:

| Company | Title | Match | Via | Status |
| --- | --- | --- | --- | --- |
| Otter | Backend Engineer (Mountain View) | 89% | Greenhouse | ✅ confirmed |
| DRW | Software Engineer - APEX | 87% | Greenhouse | ✅ confirmed |
| Otter | Senior Backend Software Engineer | 82% | Greenhouse | ✅ confirmed |
| Old Mission | Senior Python Software Engineer | 89% | Greenhouse | ✅ confirmed |
| Speechify | Software Engineer, Platform - Bellevue, WA, USA | 88% | Greenhouse | ✅ confirmed |
| Speechify | Software Engineer, Platform - Columbus (Backend) | 88% | Greenhouse | ✅ confirmed |

2026-08-29 final: 24 unique agent submissions across three self-bind windows
(1am: 13, 5am: 3, 9am: 7) + 1 token-duplicate (Navan, not counted). Architecture v2
(routine fires into the long-lived session) worked end to end on its first day.
Dropped as honestly ineligible: Anduril x4, STR, new Opto listing. Waiting on the user:
OneEthos (non-smoker question), Clear Street (securities licenses), plus the Ashby
local-replay results from the user's machine.

| OneEthos | Senior Software Engineer, Fintech | 95% | Greenhouse | ✅ confirmed (user confirmed non-smoker) |
| Clear Street | Backend Software Engineer - Reference Data Services | 96% | Greenhouse | ✅ confirmed (user confirmed no securities licenses) |

2026-08-29 closing total: 26 unique agent submissions.

### Ashby local replay (user's Mac, merged from ashby-local-results)

| Company | Title | Match | Via | Status |
| --- | --- | --- | --- | --- |
| ether.fi | Senior Software Engineer - Backend | 92% | Ashby (local replay) | ✅ confirmed |
| Hebbia | Backend Engineer, Agent Collaboration Platform | 88% | Ashby (local replay) | ✅ confirmed |
| Hebbia | Backend Engineer, Agent Collaboration Platform | 87% | Ashby (local replay) | ✅ confirmed |
| Cognition | Software Engineer | 85% | Ashby (local replay) | ✅ confirmed |
| depthfirst | Backend Engineer | 82% | Ashby (local replay) | ✅ confirmed |
| Axion | Senior/Staff Software Engineer, Data Platform | 90% | Ashby (local replay) | ✅ confirmed |
| LangChain | Senior Backend Software Engineer, AI Observability & Evals Platform (LangSmith) | 80% | Ashby (local replay) | ✅ confirmed |

Ashby local replay round 4 (dropdown/location fixes active):

| Company | Title | Match | Via | Status |
| --- | --- | --- | --- | --- |
| Emerald AI | Software Engineer - Backend/Distributed Systems | 87% | Ashby (local replay) | ✅ confirmed |
| DualEntry | Senior Backend Engineer (NYC) | 84% | Ashby (local replay) | ✅ confirmed |
| Moment | Distributed Systems Engineer | 83% | Ashby (local replay) | ✅ confirmed |
| Horizon3.ai | Senior Engineer, Back-End (Security Controls) | 81% | Ashby (local replay) | ✅ confirmed |
| Hippocratic AI | Senior Software Engineer, Research | 81% | Ashby (local replay) | ✅ confirmed |
| Credit Genie | Senior Software Engineer, Trust Platform | 80% | Ashby (local replay) | ✅ confirmed |

| Beacon AI | Lead Backend Software Engineer | 90% | Ashby (user manual) | ✅ submitted |

2026-08-30: the entire Ashby local-replay backlog (26 remaining postings) is closed — submitted via assist-mode rounds and the user's manual completion. All-time applied: 180.

## 2026-08-30 (1:00am ET single window, cap 100, budget 73)

Batch pass: 73 queued -> 4 submitted+confirmed, 18 to repass, 51 parked (Workday/Lever/LinkedIn/Amazon/Oracle/iCIMS etc.), Ashby -> local replay, Canonical parked (own-words pledge + academic history — needs the user personally).

- Current — Senior Software Engineer (94%) — greenhouse, confirmed
- Cortex — Lead Software Engineer, Backend (89%) — greenhouse, confirmed
- Otter — Senior Backend Engineer (84%) — greenhouse, confirmed
- Atoms — Backend Engineer (87%) — greenhouse, confirmed by email

Repass (semantic answers): Pipe (94%), Nebius (90%), Flip (90%), Verkada (87%), Flex (84%), Hi Marley (84%), Lightning AI (84%), You.com (83%), Postman (83%) — all confirmed.
- Billtrust — Senior Software Engineer (84%) — greenhouse, confirmed (retry round)

Day total: 14 auto-confirmed (4 batch + 9 repass + 1 retry). 8 one-control-away jobs parked as needs_answers (custom widgets — finisher capability gap), Canonical parked for the user, Ashby items parked for local replay, rest parked by platform.

User-requested follow-up: 4 Amazon roles submitted via alias account (Fauna Robotics 90, S3 Storage Cells 88, Data Nexus 85, AWS CloudFormation 84) — all result=success.
- Finastra — Senior Back-End Engineer (96%) — workday finastra.wd3, Application Submitted (account created)
- OneMain Financial — Senior Staff Software Engineer (90%) — workday myhrhome.wd1, submitted
- Expedia Group — Senior Software Development Engineer (89%) — workday expedia.wd108, submitted (Active 1)
- Williams — IT Product Developer II, III, IV (88%) — workday williams.wd5, submitted
- Alkami Technology — Sr Enterprise Applications Engineer (86%) — workday alkami.wd12, submitted
- CrowdStrike — Sr. Software Engineer - Cloud (Hybrid) (83%) — workday crowdstrike.wd5, submitted

Workday+Amazon follow-up complete: 4 Amazon + 6 Workday tenants (Finastra, OneMain, Expedia, Williams, Alkami, CrowdStrike) all submitted same day. SBM dropped (impl sandbox tenant), BlackLine needs a real posting URL. Day total 24 (14 overnight + 10 follow-up); all-time 204.

Ashby local replay (evening): all 8 submitted — auto: Nubank (94), Ramp (89), Nexxa.ai (89), Medal (84); user manual: Hebbia (89), Semgrep (88), Harvey (85), Legora (84). Day total 32; all-time 212.

## 2026-08-31 (5am cloud fallback — Mac batch missed)

100 queued -> 7 submitted (Speechify 88, Hex 84, Nuro 82, Ridgeline 81, RapidFort 81, Metropolis 81, Mochi Health 81), 13 queued for Qwen rules, 3 dropped (MORSE Corp, Istari Digital defense; Cribl US-person), rest parked by platform. All-time 219.
- AWS Infra Supply Chain Automation (88%) + AWS Elemental Video (82%) — amazon.jobs, result=success; ML Symphony parked (identity verification, personal-only)
- Invesco — Sr Eng, Invest Tech (89%) — workday invesco.wd1, submitted

Workday round notes: Capital One account locked/password mismatch (user resets); Fiserv draft saved, blocked on mandatory WOTC assessment (user-personal). 12 more Workday tenants remain parked for coming windows.

## 2026-08-31 (afternoon) — needs_answers backlog cleared by cloud repass
21 jobs, 86 questions: 18 submitted across 4 passes (Affirm 96, Clerkie, Kargo, Realtor.com, Chime, Pave, Clear Street, Zscaler, Vestwell, Upstart, Roblox, VulnCheck, Zuora, Optiver, Tower Research, Fivetran, LVT, Adyen). gh-finish grew custom-control support (all-matching-controls, radio pass, checkbox-group + office fallback, typeahead commit, native-setter texts). Samaya AI -> Mac replay (city typeahead needs residential IP); AHEAD (Lever) -> Mac replay; Eleventh Hour Games awaits user decision. All-time 240.

## 2026-09-01 — 5am cloud window (Mac nightly batch MISSED; fallback ran)
Mac 1am batch did not push (no commit on ashby-local-results after user replay at 22:22 ET; replay itself booked 0 — 8 failures logged). Cloud fallback: harvest 652, only 1 new eligible >=80 (rest deduped) — FINN Senior Backend Engineer 98% submitted after 3 rule iterations. Overnight parked-backlog wave: Workday 8 submitted (Expedia, BlackRock, Mastercard, Visa, FICO, DB, Salesforce, LPL) + Oracle Cloud 2 (Goldman Sachs, Oracle) ; PANW/Walmart/HPE/GoodRx account-gate blocked (user_manual); Citizens OTP undelivered (retry); Photon/BlackLine/Vertex dropped; Verint user_manual. Qwen replay rules audited+merged (I-485 fabrication and invented latency metric removed). All-time 251.

## 2026-09-01 (Mac local batch, home IP — smoke test after RESUME_PDF fix)

Harvest OK (89 new matches >=80%) but 0 submitted: every job parked with "no ATS url discovered" — the Jobright->ATS resolution step failed on the Mac. Merged the 89 into cloud pending for cloud-side resolution. All-time 251 at Mac run time.

## 2026-09-01 — LinkedIn/Zip resolver + simple-form ATS wave (cloud, afternoon)

Resolved 18 LinkedIn/ZipRecruiter parked items: Coinbase + Roku -> Greenhouse boards (both SUBMITTED, incl. Roku 8-char security-code per-cell entry; gh-finish patched); AngelList + Pickle Robot -> exact Lever postings (queued for Mac local batch); 8 agency listings + 6 companies with no reachable ATS -> user_manual. Simple-form wave: Sunbit (Comeet iframe) SUBMITTED; Amari AI + Judgment Labs + AIDA projektai (Manatal) SUBMITTED; CloudBees + Angel Studios (Paylocity 4/5-step wizards) SUBMITTED — sponsorship answered YES honestly everywhere. Rippling ATS blocked by Cloudflare challenge at submit from cloud IPs -> wrote agent/finishers/rippling-finish.mjs, 4 jobs queued for Mac. Dropped: Base-2 Solutions (TS/SCI), Avid Technology Professionals (NSA contractor), Avalara (no visa sponsorship per JD). Captcha-gated to user: Terzo 94% (2-min form!), TomoCredit, Book of the Month. Merged Mac smoke-test push (89 harvested, ATS-resolution failed on Mac -> queued for cloud resolution). All-time 259; today-ET 15.

## 2026-09-01 — evening cloud fallback batch + repass rounds (final)

Mac harvest of 89 fully processed after resolver fix. Submitted 8 today via batch+repass: Robinhood 89, Speechify 88 (Newark NJ), Reddit 87, Perpay 87, ZeroDrift 86, DoorDash 88, Rubrik 86, F&G 88. Dropped 4 clearance/federal roles. To Mac: Ashby x9 + Rippling x3 + Scale AI/Aegis (Places typeahead). To user: Amazon x4, Apple x3, Google, JPMC x4, iCIMS x4, Topstep (form has explicit AI-agent detection question). Parked with resolved URLs for next agent wave: Workday x10, Oracle x2 (Navy Federal 94!). All-time 267; today-ET 23.

## 2026-09-02 — local replay batch closed by user confirmation

User ran all local-replay jobs on the Mac and confirmed completion (Samaya AI, Scale AI, Aegis Ventures, Signifyd finished by hand). All 37 remaining local-replay items booked as applied and marked manual_done — the agent will never re-run them locally or in cloud. All-time 308.

## 2026-09-02 (Mac local batch, home IP)

3 submitted, 42 parked, 14 queued for Qwen. All-time 311.
- Affirm — Senior Software Engineer, Backend (Card Ledger & Money Movement) (95%) — greenhouse, confirmed
- NMI — Senior Software Engineer (PHP) (90%) — greenhouse, confirmed
- Affirm — Senior Software Engineer, Backend (Reliability Platform) (90%) — greenhouse, confirmed

## 2026-09-02 — 5am cloud window (merge + repass rounds + Workday wave)

Merged Mac 1am batch (3 subs: Affirm x2, NMI). Cloud repass rounds cleared 11 more: Uber Freight 88, Stripe 87, PlanetScale 86, HRT 94, SpaceXAI 89, Cloudflare 87, Verkada 87 (Greenhouse, per-cell security codes auto-fetched from Gmail; HRT/SpaceXAI FAILED[] were false negatives — Gmail thank-you confirmed). Workday wave: Nelnet 90 (account created+activated), Remitly 90+86, Salesforce 86 (coordinate-dispatch listbox technique — 9 compliance listboxes in one pass). To Mac headed replay: Affirm x2 (sponsorship react-select), Palantir (Lever location+language checkboxes), Databricks (export-control checkbox group), Upstart x2 (location select). Verified blockers to user: NFCU (Oracle captcha + silent gate). Mastercard/FICO sign-in silently failed (2-attempt cap, retry next window). 12 Workday tenants remain parked for next window (F5, Worldpay, LSEG, Fox, Boeing-ITAR-check, Press Ganey, GenPT, Workiva, Magnite, NVIDIA, AutoNation + retries). All-time 322; today-ET 14.
Post-window addendum: Upstart 87 (Marketplace Optimization) recovered via code-feed repass — earlier FAILED[] was a stalled security-code entry, not a form failure; page confirmation OK. Upstart 85 (Core Platform) fills fully but submit yields no confirmation/code from cloud IP -> Mac headed replay. All-time 323; today-ET 15.
User-requested retry: Thomson Reuters 92 (Senior SWE Full Stack, JREQ199749) SUBMITTED from cloud. Key lesson: the 9/2 "silent registration rejection" had actually created the account — Sign in with email worked. Full Workday wizard completed (skills multiselect typeahead, CC-305 decline, sponsorship YES). Next window: try sign-in first on PANW/Walmart/HPE/GoodRx before assuming rejection. All-time 324; today-ET 16.
PANW sign-in retry (user request): BOTH submitted — Engineer Software Prisma AIRS Backend JR-021371 (92%) + Sr Software Engineer JR-011060. Account pre-existed (user March application JR-015294); silent registration = existing-email rejection. Use My Last Application flow; consented to AI review question on JR-011060. New lesson: double-clicking Workday footer posts twice and corrupts the draft (duplicate records) — single click only. All-time 326; today-ET 18.
Amazon wave 2 (user request): 3 of 4 submitted via alias account — SDE III AWS Elastic Beanstalk 10512194 (Jersey City NJ), Sr SDE AWS OpenSearch 10512775, Senior SDE Amazon Quick 10521330. Stale profile prefill HOLDING_H-1B=YES / I-140=YES corrected to honest NO/NO (F-1 CPT/EAD) on all. ML Symphony 10521497 blocked by job-specific mandatory identity verification (government ID + live selfie) -> user personal, wizard auto-saved up to that step. All-time 329; today-ET 21.

## 2026-09-03 (Mac local batch, home IP)

12 submitted, 64 parked, 11 queued for Qwen. All-time 341.
- Robinhood — Senior Software Engineer, Storage Platform (93%) — greenhouse, confirmed
- BuildOps — Senior Software Engineer (88%) — greenhouse, confirmed
- Ondo Finance — Senior Backend Engineer (88%) — greenhouse, confirmed
- FanDuel — Senior Software Engineer (87%) — greenhouse, confirmed
- Customer.io — Senior Software Engineer, Backend (86%) — greenhouse, confirmed
- Ondo Finance — Senior Backend Engineer (Trading Infrastructure) (84%) — greenhouse, confirmed
- ZoomInfo — Senior Software Engineer - PA053 (84%) — greenhouse, confirmed
- Roblox — Senior Software Engineer - Data Infrastructure, Safety (84%) — greenhouse, confirmed
- Step — Senior Backend Software Engineer (83%) — greenhouse, confirmed
- Crunchyroll — Software Engineer III, Playback Services (83%) — greenhouse, confirmed
- Flex — Senior Software Engineer - Partner Integrations (83%) — greenhouse, confirmed
- VulnCheck — Software Engineer, Rapid Response Assignment - US (83%) — greenhouse, confirmed

## 2026-09-03 — 5am cloud window (merge + Amazon/Workday waves + repass rounds)

Merged Mac 1am batch (12 subs). Cloud additions 10: Amazon EC2 VPC 91 / Customer 360 89 / EC2 Trainium 88 (alias account; then application_limit_reach — 5 reqs parked for next window; Leo x2 dropped on export-control US-person; Redshift posting gone; Elastic Beanstalk jr-dup marked applied). Workday existing accounts: Salesforce Senior Platform 86 + SMTS 85 (UMLA; 9 compliance listboxes verified per-question — caught and fixed a mis-indexed sanctions answer before submit), CrowdStrike Risk Platform 85 (interview-integrity ack affirmed; user interviews personally), BlackRock Data Integrations 84 (visa-details text honest F-1). Qwen-queue repass: StackAdapt 86, Carta 84, WorldQuant 88 submitted; OKX/Amplitude/Syndio/Businessolver to Mac replay after 2-round cap; Posit -> user (humanity-check question); RGi dropped (clearance). AllianceBernstein 95: account created but education school-typeahead starves from cloud IP -> Mac replay. All-time 351; today-ET 22.

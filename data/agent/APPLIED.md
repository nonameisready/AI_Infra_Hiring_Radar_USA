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

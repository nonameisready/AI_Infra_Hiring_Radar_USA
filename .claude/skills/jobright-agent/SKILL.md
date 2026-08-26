---
name: jobright-agent
description: Run the daily Jobright auto-apply cycle — log into jobright.ai, apply to today's ≥80% matches (Jobright flow first, company site as fallback), never duplicate, park failures for manual apply, log successes to APPLIED.md, commit state. Use when the user says "run the jobright agent", "帮我投递今天的工作", or when the daily Routine fires.
---

Follow `agent/RUNBOOK.md` in this repository exactly — it is the complete procedure
(setup, login with Gmail-assisted verification, match fetching, the apply loop, the
never-duplicate and never-guess rules, state writing, and the commit/push at the end).

Quick orientation:

- State lives in `data/agent/` (config, profile, memory, questions, applied registry,
  pending backlog, APPLIED.md log). Read all of it before doing anything.
- The browser fast path is `worker/jobright-agent.mjs` (login / matches / apply /
  snapshot subcommands, JSON out). When its selectors fail it leaves a screenshot and
  text dump — take over with Playwright yourself; the script is convenience, the
  runbook's rules are the contract.
- Secrets: `JOBRIGHT_PASSWORD` from the environment only. Never commit cookies,
  storage state, or passwords. Never type the Google account password into a browser.
- If a blocking question is unanswered, don't guess — record it in
  `data/agent/questions.json`, tell the user, and apply only what can be applied safely.
- End every run by committing `data/agent/**` to `main` and reporting what happened.

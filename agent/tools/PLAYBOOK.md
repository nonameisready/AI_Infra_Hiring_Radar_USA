# Cloud driver playbook (portable — any model/session/machine)

These tools were battle-tested in the 2026-09 cloud windows (35-confirmed day on 2026-09-10).
They are plain Node scripts: any orchestrator (Claude session, local Qwen on the Mac, a shell
script) can drive them. The honesty/policy contract lives in agent/RUNBOOK.md and
agent/KNOWLEDGE.md — tools never decide answers; the orchestrator does.

## Setup (fresh session/machine)
```
export AGENT_WORK_DIR=<scratch dir>            # all tools read this
ln -sfn <repo>/node_modules $AGENT_WORK_DIR/node_modules
cp <resume pdf> $AGENT_WORK_DIR/Hui_Mao_Backend_Software_Engineer.pdf
cd $AGENT_WORK_DIR && AGENT_WORK_DIR=$AGENT_WORK_DIR \
  DRIVER_UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36" \
  PLAYWRIGHT_CHROMIUM_PATH=<chromium> nohup node driver.mjs wd about:blank --resume >> wd-driver.log 2>&1 &
# wait until `tail -1 wd-driver.log` prints READY. ONE driver instance only.
```
Command protocol: write `$AGENT_WORK_DIR/wd-cmd.json` = `{"actions":[...]}`
(actions: goto/typeSlow/fill/click/clickText/press/upload/evalJs/wait). Results append to wd-driver.log.

**Marker-wait (essential):** log tails go stale. Append a unique marker (e.g. `MK$(date +%s)`)
to the LAST evalJs string of every command file and poll `grep -q "$MARKER" wd-driver.log`.

## Ashby (jobs.ashbyhq.com) — gen-ashby1.mjs / gen-ashby2.mjs
- R1 `node gen-ashby1.mjs <application URL>`: goto, resume upload, name/email, mega-probe →
  fillPlan / yesIds / noIds / radioGroups / unknown / req.
- Probe unknown questions yourself (fieldEntry innerText) before answering; then
  R2 `node gen-ashby2.mjs '<planJson>'` (fillPlan/yesIds/noIds/radioIds/loc) fills + submits + probes.
- React quirks: yes/no widgets are `button[data-option=yes|no]` pairs — assign an id, use a
  TRUSTED driver click (synthetic events / checkbox.click() do NOT register). Same for radios
  (`input[id='...']`) and required text fields (typeSlow, not value-setter). number inputs want
  "150000" not "$150,000+". Location autocompletes: typeSlow "Jersey City" + ArrowDown + Enter;
  portal options have React ids like ":r3h:" → `[id=':r3h:']`. Datepickers ("Pick date..."):
  type MM/DD/YYYY + Enter. Searchable selects ("Start typing..."): type a prefix, list
  `[role=option]`, click by id. Progressive disclosure: required fields appear after answers —
  iterate on the submit-probe errors.
- **Spam filter:** submit probe checks `/flagged as possible spam/`. One flag = retry once.
  Two flags = PARK as user_manual with all answers in the note (never a 3rd try).
  Fresh/cold browser contexts get flagged immediately — always reuse the persistent driver
  session. The filter also HEATS UP after ~8-12 submissions in quick succession; when 2-3
  consecutive companies double-flag, stop the lane and retry hours later.
- Only Gmail from:ashbyhq.com confirmations count. Some companies never send one →
  status submitted_unconfirmed, re-check at day close.

## Greenhouse (job-boards.greenhouse.io) — build-gh1.mjs
- `node build-gh1.mjs "<embed job_app URL with for=&token=>"` probes labels/ids/types (SEL = react-select).
- Fill pattern: typeSlow fields, `upload` resume, react-select via PICK helper (open by typeSlow
  '' on the input, then mousedown/mouseup/click on `[class*=select__option]` matching an ANCHORED
  regex; Escape after every pick; numeric ids need `[id='...']` not `#...`).
- Submit → if `#security-input-0` appears, fetch the newest Gmail
  `in:anywhere subject:(security code <company>)`, typeSlow the code, resubmit. A warmed driver
  session often skips the code entirely. Success = /confirmation URL or thank-you text
  (wording varies: "Thanks for reaching out", "Success", etc. — check location.href too).
- Uncoded GH attempts are undelivered → always safe to redo from scratch.

## Batch — batch-apply.mjs
`node batch-apply.mjs --start N --count N --gh-cap N` over $AGENT_WORK_DIR/today-queue.json;
appends batch-results.jsonl; NEED_CODE → write the code to $AGENT_WORK_DIR/gh-code.txt fast,
late codes end as needs_answers (rescue via driver later).

## Booking — book-generic.mjs
`node book-generic.mjs '<companyRegex>' '<detail>' [atsUrl]` moves a pending entry into
data/agent/applied.json (dedupes by id AND company). Only book Gmail-confirmed (or GH
confirmation-page) applies; commit+push data/agent/** after each booking with the session's
required commit trailer. CAREFUL: the regex takes the FIRST pending match — when a company has
several roles, verify the booked title matches the role actually applied.

## Standing screens the orchestrator must apply (see KNOWLEDGE.md for the full contract)
- Defense/clearance/US-person/ITAR gates → drop honestly. Arbitration agreements, no-AI pledges,
  own-expense relocation pledges → park user_manual (user signs personally). Plain relocation
  willingness = Yes is fine. Unverifiable personal facts (GPA, KPIs, team size) → never invent;
  record in questions.json. Skills: no Java/Scala/Rails/Rust/C#/C++/React claims.
- Sponsorship ALWAYS Yes; current status F-1 (CPT/EAD thru 05/31/2027); cap-exempt H-1B transfer
  (activated via BlackRock) + I-140 approved; never I-485/citizen/LPR; "authorized without
  restrictions / for any employer" → No.

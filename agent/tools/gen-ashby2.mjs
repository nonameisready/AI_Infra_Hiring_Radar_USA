// Round 2: trusted yes/no clicks + location + submit + probe.
// Usage: node gen-ashby2.mjs '<planJson>'   (plan = round-1 result: {loc, yesIds, noIds})
import fs from 'fs';
const W = process.env.AGENT_WORK_DIR;
const plan = JSON.parse(process.argv[2]);
const A = [];
for (const f of plan.fillPlan || []) { A.push({ do: "typeSlow", sel: "[id='" + f.id + "']", value: f.val }); }
for (const id of plan.yesIds || []) { A.push({ do: 'click', sel: "[id='" + id + "']" }); A.push({ do: 'wait', ms: 500 }); }
for (const id of plan.noIds || []) { A.push({ do: 'click', sel: "[id='" + id + "']" }); A.push({ do: 'wait', ms: 500 }); }
for (const id of plan.radioIds || []) { A.push({ do: 'click', sel: "input[id='" + id + "']" }); A.push({ do: 'wait', ms: 500 }); }
if (plan.loc) {
  A.push({ do: 'typeSlow', sel: "[id='" + plan.loc + "']", value: 'Jersey City' });
  A.push({ do: 'wait', ms: 2500 });
  A.push({ do: 'press', key: 'ArrowDown' });
  A.push({ do: 'wait', ms: 400 });
  A.push({ do: 'press', key: 'Enter' });
  A.push({ do: 'wait', ms: 1200 });
}
A.push({ do: 'evalJs', code: `(function(){var b=[].slice.call(document.querySelectorAll('button')).filter(function(x){return x.offsetParent&&/submit application|^submit/i.test(x.textContent.trim())})[0];if(!b)return 'no submit';b.click();return 'submitted'})()` });
A.push({ do: 'wait', ms: 9000 });
A.push({ do: 'evalJs', code: `JSON.stringify({success:/thank you|received|submitted|successfully/i.test(document.body.innerText.slice(0,3000)),spam:/flagged as possible spam/i.test(document.body.innerText),formGone:!document.getElementById('_systemfield_name'),errs:[].slice.call(document.querySelectorAll('[class*=error],[role=alert]')).map(function(e){return e.textContent.trim().slice(0,60)}).filter(Boolean).slice(0,4)})` });
const out = JSON.stringify({ actions: A });
JSON.parse(out);
fs.writeFileSync(W + '/wd-cmd.json', out);
console.log('ashby r2 written: yes=' + (plan.yesIds || []).length + ' no=' + (plan.noIds || []).length + ' loc=' + !!plan.loc);

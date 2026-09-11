// Usage: node book-by-id.mjs <pendingJobId> <at ISO date> <via> '<detail>'
// Books ONE pending entry, addressed by its exact job id, into applied.json.
// Unlike book-generic.mjs this never guesses which role of a multi-role company
// was the one that got confirmed, and it carries the real submission date.
import fs from 'fs';
const R = process.env.REPO_DIR || '/home/user/AI_Infra_Hiring_Radar_USA';
const [id, at, via, detail] = process.argv.slice(2);
if (!id || !at || !via || !detail) throw new Error('usage: book-by-id.mjs <id> <at> <via> <detail>');
const ap = JSON.parse(fs.readFileSync(R + '/data/agent/applied.json', 'utf8'));
const pd = JSON.parse(fs.readFileSync(R + '/data/agent/pending.json', 'utf8'));
const pArr = pd.items || pd;
const idx = pArr.findIndex((x) => x.id === id);
if (idx < 0) throw new Error('not in pending: ' + id);
const j = pArr[idx];
if (ap.jobs[j.id]) throw new Error('already applied: ' + j.id);
ap.jobs[j.id] = {
  id: j.id,
  key: j.key || `${(j.company || '').toLowerCase().trim()}::${(j.title || '').toLowerCase().trim()}`,
  company: j.company,
  title: j.title,
  matchPercent: j.matchPercent,
  jobrightUrl: j.jobrightUrl,
  originalUrl: (j.atsUrl || j.originalUrl || '').split('?')[0],
  status: 'applied',
  at,
  via,
  detail,
};
ap.updatedAt = new Date().toISOString();
pArr.splice(idx, 1);
pd.updatedAt = ap.updatedAt;
fs.writeFileSync(R + '/data/agent/applied.json', JSON.stringify(ap, null, 2) + '\n');
fs.writeFileSync(R + '/data/agent/pending.json', JSON.stringify(pd, null, 2) + '\n');
console.log('booked #' + Object.keys(ap.jobs).length, j.company, '—', j.title, '@', at);

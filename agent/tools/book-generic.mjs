// Usage: node book-generic.mjs '<companyRegex>' '<detail>' [atsUrl]
import fs from 'fs';
const R = '/home/user/AI_Infra_Hiring_Radar_USA';
const [re, detail, atsUrl] = process.argv.slice(2);
if (!re || !detail) throw new Error('usage: book-generic.mjs <companyRegex> <detail> [atsUrl]');
const rx = new RegExp(re, 'i');
// The booking date used to be a hardcoded literal, which silently filed every
// later run's applications under that one day and broke the per-day counts.
// Default to today in ET (the day boundary the daily goal is measured against);
// BOOK_DATE overrides it when back-filling a previous day on purpose.
const today = process.env.BOOK_DATE
  || new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
const ap = JSON.parse(fs.readFileSync(R + '/data/agent/applied.json', 'utf8'));
const pd = JSON.parse(fs.readFileSync(R + '/data/agent/pending.json', 'utf8'));
const pArr = pd.items || pd;
const idx = pArr.findIndex(x => rx.test(x.company || ''));
if (idx < 0) throw new Error('not in pending: ' + re);
const j = pArr[idx];
if (ap.jobs[j.id]) throw new Error('already applied: ' + j.id);
const dupCo = Object.values(ap.jobs).some(x => (x.company || '').toLowerCase() === (j.company || '').toLowerCase());
if (dupCo) throw new Error('company already in applied: ' + j.company);
ap.jobs[j.id] = {
  id: j.id,
  company: j.company,
  title: j.title,
  matchPercent: j.matchPercent,
  jobrightUrl: j.jobrightUrl,
  originalUrl: atsUrl || (j.atsUrl || '').split('?')[0],
  status: 'applied',
  at: today,
  via: process.env.BOOK_VIA || 'ashby (cloud driver)',
  detail
};
ap.updatedAt = new Date().toISOString();
pArr.splice(idx, 1);
fs.writeFileSync(R + '/data/agent/applied.json', JSON.stringify(ap, null, 2) + '\n');
fs.writeFileSync(R + '/data/agent/pending.json', JSON.stringify(pd, null, 2) + '\n');
console.log('booked #' + Object.keys(ap.jobs).length, j.company, '—', j.title);

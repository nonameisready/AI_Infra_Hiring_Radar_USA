// lib/ingest/lever.ts
type LeverJob = any; // replace with your mapped type

export async function fetchLeverJobsAll(leverKey: string): Promise<LeverJob[]> {
  const all: LeverJob[] = [];
  const limit = 100;
  let offset = 0;

  while (true) {
    const url = `https://api.lever.co/v0/postings/${leverKey}?mode=json&limit=${limit}&offset=${offset}`;
    const res = await fetch(url, { headers: { "accept": "application/json" } });

    if (res.status === 404) {
      // important: do NOT throw if you want refresh to keep going for other companies
      // you can return [] or throw; I recommend returning [] and logging once.
      throw new Error(`Lever fetch failed: 404 for key=${leverKey}`);
    }
    if (!res.ok) throw new Error(`Lever fetch failed: ${res.status} ${res.statusText}`);

    const jobs = await res.json();
    if (!Array.isArray(jobs)) throw new Error(`Lever returned non-array payload`);

    all.push(...jobs);

    if (jobs.length < limit) break;
    offset += limit;

    if (offset > 20000) break; // safety guard
  }

  return all;
}


// import { classifyRole, inferSeniority, isSeniorStaff } from "../classify";

// type LeverJob = {
//   id: string;
//   text: string;
//   hostedUrl: string;
//   categories?: { team?: string; location?: string };
//   createdAt?: number;
// };

// export async function fetchLeverJobs(companySlug: string) {
//   const url = `https://api.lever.co/v0/postings/${encodeURIComponent(companySlug)}?mode=json`;
//   const res = await fetch(url, { cache: "no-store" });
//   if (!res.ok) throw new Error(`Lever fetch failed: ${res.status}`);
//   const jobs = (await res.json()) as LeverJob[];

//   return jobs
//     .map((j) => {
//       const team = j.categories?.team ?? "";
//       const loc = j.categories?.location ?? "";
//       const remote = /remote/i.test(loc) || /remote/i.test(j.text);
//       const types = classifyRole(j.text, team);
//       const postedAt = j.createdAt ? new Date(j.createdAt) : null;

//       return {
//         source: "lever",
//         sourceJobId: j.id,
//         title: j.text,
//         location: loc || null,
//         remote,
//         team: team || null,
//         url: j.hostedUrl,
//         postedAt,
//         matchedTypes: types.join(","),
//         seniority: inferSeniority(j.text),
//       };
//     })
//     // Keep Senior/Staff/Lead only, but do NOT persist the flag in DB (schema doesn't include it)
//     .filter((j) => isSeniorStaff(j.title));
// }

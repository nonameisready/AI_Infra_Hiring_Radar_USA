// lib/ingest/greenhouse.ts
type GreenhouseJob = any; // replace with your mapped type

export async function fetchGreenhouseJobsAll(boardToken: string): Promise<GreenhouseJob[]> {
  const all: GreenhouseJob[] = [];
  const per_page = 100; // GH typically allows up to 100
  let page = 1;

  while (true) {
    const url = `https://boards-api.greenhouse.io/v1/boards/${boardToken}/jobs?content=true&page=${page}&per_page=${per_page}`;
    const res = await fetch(url, { headers: { "accept": "application/json" } });

    if (!res.ok) throw new Error(`Greenhouse fetch failed: ${res.status} ${res.statusText}`);
    const data = await res.json();

    const jobs = data?.jobs ?? [];
    all.push(...jobs);

    // stop condition: returned less than per_page (or empty)
    if (jobs.length < per_page) break;

    page++;
    // (optional) hard stop to prevent infinite loops if API misbehaves
    if (page > 200) break;
  }

  return all;
}


// import { classifyRole, inferSeniority, isSeniorStaff } from "../classify";

// type GhJob = {
//   id: number;
//   title: string;
//   absolute_url: string;
//   location?: { name?: string };
//   departments?: { name?: string }[];
//   created_at?: string;
// };

// export async function fetchGreenhouseJobs(boardToken: string) {
//   const url = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(boardToken)}/jobs`;
//   const res = await fetch(url, { cache: "no-store" });
//   if (!res.ok) throw new Error(`Greenhouse fetch failed: ${res.status}`);
//   const data = (await res.json()) as { jobs: GhJob[] };

//   return data.jobs
//     .map((j) => {
//       const team = j.departments?.map((d) => d.name).filter(Boolean).join(", ") ?? undefined;
//       const types = classifyRole(j.title, team);
//       const postedAt = j.created_at ? new Date(j.created_at) : null;
//       const loc = j.location?.name ?? "";
//       const remote = /remote/i.test(loc) || /remote/i.test(j.title);

//       return {
//         source: "greenhouse",
//         sourceJobId: String(j.id),
//         title: j.title,
//         location: loc || null,
//         remote,
//         team: team || null,
//         url: j.absolute_url,
//         postedAt,
//         matchedTypes: types.join(","),
//         seniority: inferSeniority(j.title),
//       };
//     })
//     // Keep Senior/Staff/Lead only, but do NOT persist the flag in DB (schema doesn't include it)
//     .filter((j) => isSeniorStaff(j.title));
// }

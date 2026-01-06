import { PrismaClient } from "@prisma/client";
import { Badge } from "../components/Badge";

const prisma = new PrismaClient();

function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4">{children}</div>;
}

export default async function Home() {
  const [companies, jobs] = await Promise.all([
    prisma.company.findMany({ orderBy: [{ starred: "desc" }, { name: "asc" }] }),
    prisma.job.findMany({
      orderBy: [{ postedAt: "desc" }, { updatedAt: "desc" }],
      take: 200,
      include: { company: true },
    }),
  ]);

  return (
    <main className="mx-auto max-w-6xl p-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">AI Infra Hiring Radar (USA)</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Pre-seeded hot companies. Ingestion keeps <span className="text-zinc-200">Senior/Staff/Lead</span> only.
          </p>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-3">
        <section className="md:col-span-1">
          <Card>
            <h2 className="text-sm font-semibold text-zinc-200">Companies</h2>
            <p className="mt-1 text-xs text-zinc-500">Run <code className="text-zinc-300">npm run prisma:seed</code> to load.</p>
            <ul className="mt-3 space-y-2">
              {companies.map((c) => (
                <li key={c.id} className="rounded-xl border border-zinc-800 p-3 hover:bg-zinc-900">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{c.name}</span>
                        {c.starred && <Badge>★</Badge>}
                      </div>
                      <div className="mt-1 text-xs text-zinc-400">
                        {(c.stage ?? "unknown")} · {(c.hq ?? "USA")}
                      </div>
                      {c.tags && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {c.tags.split(",").map((t) => (
                            <Badge key={t.trim()}>{t.trim()}</Badge>
                          ))}
                        </div>
                      )}
                    </div>
                    {c.website && (
                      <a className="text-xs text-zinc-300 underline" href={c.website} target="_blank">
                        site
                      </a>
                    )}
                  </div>
                  {c.atsType && c.atsKey && (
                    <div className="mt-2 text-xs text-zinc-500">
                      ATS: {c.atsType} ({c.atsKey})
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        </section>

        <section className="md:col-span-2">
          <Card>
            <h2 className="text-sm font-semibold text-zinc-200">Latest Senior/Staff jobs (top 200)</h2>
            <p className="mt-1 text-xs text-zinc-500">After seeding, call <code className="text-zinc-300">POST /api/refresh</code>.</p>
            <div className="mt-3 overflow-hidden rounded-xl border border-zinc-800">
              <table className="w-full text-left text-sm">
                <thead className="bg-zinc-950/60 text-xs text-zinc-400">
                  <tr>
                    <th className="px-3 py-2">Role</th>
                    <th className="px-3 py-2">Company</th>
                    <th className="px-3 py-2">Type</th>
                    <th className="px-3 py-2">Location</th>
                    <th className="px-3 py-2">Posted</th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.map((j) => (
                    <tr key={j.id} className="border-t border-zinc-800 hover:bg-zinc-900">
                      <td className="px-3 py-2">
                        <a className="font-medium underline" href={j.url} target="_blank">
                          {j.title}
                        </a>
                        <div className="mt-1 text-xs text-zinc-500">{j.team ?? ""} · {j.seniority ?? ""}</div>
                      </td>
                      <td className="px-3 py-2">{j.company.name}</td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-1">
                          {(j.matchedTypes ?? "unknown").split(",").map((t) => (
                            <Badge key={t}>{t}</Badge>
                          ))}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        {j.remote ? <Badge>Remote</Badge> : null}{" "}
                        <span className="text-zinc-300">{j.location ?? "-"}</span>
                      </td>
                      <td className="px-3 py-2 text-zinc-300">
                        {j.postedAt ? new Date(j.postedAt).toLocaleDateString() : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </section>
      </div>
    </main>
  );
}

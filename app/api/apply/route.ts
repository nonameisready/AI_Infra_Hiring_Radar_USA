import { NextResponse } from "next/server";
import { applyToJobs } from "../../../lib/apply";

export const dynamic = "force-dynamic";
// Kept under the Hobby plan ceiling; a deployment is rejected if it is over.
export const maxDuration = 60;

const MAX_BATCH = 50;

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));

  const jobIds: string[] = Array.isArray(body.jobIds)
    ? body.jobIds.filter((v: unknown) => typeof v === "string")
    : typeof body.jobId === "string"
      ? [body.jobId]
      : [];

  if (!jobIds.length) {
    return NextResponse.json({ error: "Provide jobId or jobIds" }, { status: 400 });
  }
  if (jobIds.length > MAX_BATCH) {
    return NextResponse.json(
      { error: `Apply to at most ${MAX_BATCH} jobs at a time` },
      { status: 400 },
    );
  }

  const resumeId = typeof body.resumeId === "string" ? body.resumeId : null;
  const outcomes = await applyToJobs(jobIds, resumeId);

  const summary = outcomes.reduce<Record<string, number>>((acc, o) => {
    acc[o.status] = (acc[o.status] ?? 0) + 1;
    return acc;
  }, {});

  return NextResponse.json({ ok: true, summary, outcomes });
}

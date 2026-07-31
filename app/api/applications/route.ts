import { NextResponse } from "next/server";
import { prisma } from "../../../lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const status = sp.get("status");
  const track = sp.get("track");

  const applications = await prisma.application.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(track ? { job: { track } } : {}),
    },
    orderBy: { updatedAt: "desc" },
    take: 500,
    include: {
      job: { select: { id: true, title: true, url: true, applyUrl: true, track: true, company: { select: { name: true } } } },
      resume: { select: { id: true, label: true } },
    },
  });

  const counts = await prisma.application.groupBy({ by: ["status"], _count: { _all: true } });

  return NextResponse.json({
    counts: Object.fromEntries(counts.map((c) => [c.status, c._count._all])),
    applications: applications.map((a) => ({
      id: a.id,
      status: a.status,
      method: a.method,
      error: a.error,
      detail: a.detail,
      attempts: a.attempts,
      submittedAt: a.submittedAt?.toISOString() ?? null,
      updatedAt: a.updatedAt.toISOString(),
      resume: a.resume,
      job: {
        id: a.job.id,
        title: a.job.title,
        company: a.job.company.name,
        url: a.job.applyUrl || a.job.url,
        track: a.job.track,
      },
    })),
  });
}

/** Manual status corrections from the UI ("I finished this one myself"). */
export async function PATCH(req: Request) {
  const body = await req.json().catch(() => ({}));
  const allowed = ["submitted", "failed", "needs_manual", "queued", "opened", "skipped"];

  if (typeof body.jobId !== "string" || !allowed.includes(body.status)) {
    return NextResponse.json(
      { error: `jobId and status (${allowed.join(", ")}) are required` },
      { status: 400 },
    );
  }

  const application = await prisma.application.upsert({
    where: { jobId: body.jobId },
    create: {
      jobId: body.jobId,
      status: body.status,
      method: "manual",
      submittedAt: body.status === "submitted" ? new Date() : null,
    },
    update: {
      status: body.status,
      submittedAt: body.status === "submitted" ? new Date() : null,
      error: null,
    },
    select: { id: true, jobId: true, status: true },
  });

  return NextResponse.json({ ok: true, application });
}

export async function DELETE(req: Request) {
  const jobId = new URL(req.url).searchParams.get("jobId");
  if (!jobId) return NextResponse.json({ error: "jobId is required" }, { status: 400 });
  await prisma.application.delete({ where: { jobId } }).catch(() => null);
  return NextResponse.json({ ok: true });
}

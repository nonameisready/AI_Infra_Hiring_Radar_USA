import { NextResponse } from "next/server";
import { prisma } from "../../../../lib/db";
import { getProfile, pickResume } from "../../../../lib/apply";
import { isAuthorized, unauthorized } from "../../../../lib/auth";

export const dynamic = "force-dynamic";

/**
 * The browser worker pulls queued applications here, complete with everything
 * needed to fill a form: the profile, the right resume as base64, and the URL.
 */
export async function GET(req: Request) {
  if (!isAuthorized(req)) return unauthorized();

  const limit = Math.min(Number(new URL(req.url).searchParams.get("limit") ?? "5"), 25);

  const queued = await prisma.application.findMany({
    where: { status: "queued", attempts: { lt: 3 } },
    orderBy: { createdAt: "asc" },
    take: limit,
    include: { job: { include: { company: { select: { name: true } } } } },
  });

  const profile = await getProfile();

  const items = [];
  for (const app of queued) {
    const resume = await pickResume(app.job.track, app.resumeId);
    items.push({
      applicationId: app.id,
      jobId: app.jobId,
      title: app.job.title,
      company: app.job.company.name,
      url: app.job.applyUrl || app.job.url,
      source: app.job.source,
      attempts: app.attempts,
      resume: resume
        ? {
            id: resume.id,
            fileName: resume.fileName,
            mimeType: resume.mimeType,
            base64: Buffer.from(resume.data).toString("base64"),
          }
        : null,
    });
  }

  return NextResponse.json({ profile: publicProfile(profile), items });
}

/** The worker reports what happened to each application. */
export async function POST(req: Request) {
  if (!isAuthorized(req)) return unauthorized();

  const body = await req.json().catch(() => ({}));
  const { applicationId, status } = body;

  if (typeof applicationId !== "string") {
    return NextResponse.json({ error: "applicationId is required" }, { status: 400 });
  }
  const allowed = ["submitted", "failed", "needs_manual", "queued", "opened"];
  if (!allowed.includes(status)) {
    return NextResponse.json({ error: `status must be one of ${allowed.join(", ")}` }, { status: 400 });
  }

  const updated = await prisma.application
    .update({
      where: { id: applicationId },
      data: {
        status,
        error: typeof body.error === "string" ? body.error.slice(0, 1000) : null,
        detail: typeof body.detail === "string" ? body.detail.slice(0, 4000) : null,
        submittedAt: status === "submitted" ? new Date() : null,
        attempts: { increment: 1 },
      },
      select: { id: true, status: true, attempts: true },
    })
    .catch(() => null);

  if (!updated) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true, application: updated });
}

function publicProfile(p: Awaited<ReturnType<typeof getProfile>>) {
  const { id, updatedAt, ...rest } = p;
  return rest;
}

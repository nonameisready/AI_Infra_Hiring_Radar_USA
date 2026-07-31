import { NextResponse } from "next/server";
import { prisma } from "../../../../lib/db";
import { getProfile, pickResume } from "../../../../lib/apply";
import { CORS_HEADERS, corsPreflight, isAuthorized, unauthorized } from "../../../../lib/auth";

export const dynamic = "force-dynamic";

export const OPTIONS = corsPreflight;

/**
 * What the Chrome extension asks for when you click "Autofill" on a job page.
 * Pass ?jobId= to also mark the application as opened, or just ?track= to fill
 * a form the radar has never seen.
 */
export async function GET(req: Request) {
  if (!isAuthorized(req)) return unauthorized();

  const sp = new URL(req.url).searchParams;
  const jobId = sp.get("jobId");
  const resumeId = sp.get("resumeId");
  const trackParam = sp.get("track");

  let track = trackParam === "fde" ? "fde" : trackParam === "ai" ? "ai" : null;
  let job = null;

  if (jobId) {
    job = await prisma.job.findUnique({
      where: { id: jobId },
      include: { company: { select: { name: true } } },
    });
    if (job) track = job.track ?? track;
  }

  const profile = await getProfile();
  const resume = await pickResume(track, resumeId);

  const { id: _id, updatedAt: _u, ...profileFields } = profile;

  return NextResponse.json(
    {
      profile: profileFields,
      resume: resume
        ? {
            id: resume.id,
            label: resume.label,
            fileName: resume.fileName,
            mimeType: resume.mimeType,
            base64: Buffer.from(resume.data).toString("base64"),
          }
        : null,
      job: job ? { id: job.id, title: job.title, company: job.company.name, url: job.url } : null,
    },
    { headers: CORS_HEADERS },
  );
}

/** Record that a job page was opened / autofilled from the extension. */
export async function POST(req: Request) {
  if (!isAuthorized(req)) return unauthorized();

  const body = await req.json().catch(() => ({}));
  if (typeof body.jobId !== "string") {
    return NextResponse.json({ error: "jobId is required" }, { status: 400, headers: CORS_HEADERS });
  }

  const status = body.submitted ? "submitted" : "opened";
  const resume = await pickResume(null, typeof body.resumeId === "string" ? body.resumeId : null);

  await prisma.application.upsert({
    where: { jobId: body.jobId },
    create: {
      jobId: body.jobId,
      resumeId: resume?.id ?? null,
      status,
      method: "extension",
      detail: typeof body.detail === "string" ? body.detail.slice(0, 4000) : null,
      submittedAt: body.submitted ? new Date() : null,
      attempts: 1,
    },
    update: {
      status,
      method: "extension",
      detail: typeof body.detail === "string" ? body.detail.slice(0, 4000) : null,
      submittedAt: body.submitted ? new Date() : undefined,
      attempts: { increment: 1 },
    },
  });

  return NextResponse.json({ ok: true }, { headers: CORS_HEADERS });
}

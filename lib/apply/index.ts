import { prisma } from "../db";
import { submitGreenhouse, submitLever, ApplicantPayload } from "./direct";

export type ApplyOutcome = {
  jobId: string;
  title: string;
  company: string;
  url: string;
  /** submitted = done. queued = the worker will drive a browser. needs_manual = open it yourself. */
  status: "submitted" | "queued" | "needs_manual" | "failed" | "skipped";
  method: string;
  message: string;
};

/** Resolve the resume for a job: explicit pick, then track default, then any default. */
export async function pickResume(track: string | null, resumeId?: string | null) {
  if (resumeId) {
    const r = await prisma.resume.findUnique({ where: { id: resumeId } });
    if (r) return r;
  }
  return (
    (await prisma.resume.findFirst({
      where: { track: track ?? "any", isDefault: true },
      orderBy: { updatedAt: "desc" },
    })) ??
    (await prisma.resume.findFirst({
      where: { track: track ?? "any" },
      orderBy: { updatedAt: "desc" },
    })) ??
    (await prisma.resume.findFirst({ where: { isDefault: true }, orderBy: { updatedAt: "desc" } })) ??
    (await prisma.resume.findFirst({ orderBy: { updatedAt: "desc" } }))
  );
}

export async function getProfile() {
  return prisma.profile.upsert({
    where: { id: "singleton" },
    create: { id: "singleton" },
    update: {},
  });
}

function profileComplete(p: { firstName: string; lastName: string; email: string }) {
  return Boolean(p.firstName.trim() && p.lastName.trim() && p.email.trim());
}

/**
 * Apply to one job.
 *
 * Direct ATS submission runs immediately when an employer key is configured.
 * Otherwise the job is queued for the browser worker, and if no worker is
 * enabled it is marked needs_manual so the UI can hand you the link.
 */
export async function applyToJob(jobId: string, resumeId?: string | null): Promise<ApplyOutcome> {
  const job = await prisma.job.findUnique({ where: { id: jobId }, include: { company: true } });
  if (!job) {
    return {
      jobId,
      title: "?",
      company: "?",
      url: "",
      status: "failed",
      method: "none",
      message: "Job not found",
    };
  }

  const base = {
    jobId,
    title: job.title,
    company: job.company.name,
    url: job.applyUrl || job.url,
  };

  const profile = await getProfile();
  if (!profileComplete(profile)) {
    return {
      ...base,
      status: "failed",
      method: "none",
      message: "Fill in your name and email in Profile first",
    };
  }

  const resume = await pickResume(job.track, resumeId);
  if (!resume) {
    return { ...base, status: "failed", method: "none", message: "Upload a resume first" };
  }

  const existing = await prisma.application.findUnique({ where: { jobId } });
  if (existing && existing.status === "submitted") {
    return {
      ...base,
      status: "skipped",
      method: existing.method,
      message: "Already submitted",
    };
  }

  const payload: ApplicantPayload = {
    profile: {
      firstName: profile.firstName,
      lastName: profile.lastName,
      email: profile.email,
      phone: profile.phone,
      location: profile.location,
      linkedin: profile.linkedin,
      github: profile.github,
      website: profile.website,
      coverLetter: profile.coverLetter,
    },
    resume: {
      fileName: resume.fileName,
      mimeType: resume.mimeType,
      bytes: Buffer.from(resume.data),
    },
  };

  // --- Path 1: direct ATS API submission -----------------------------------
  if (job.applyMethod === "greenhouse_api" || job.applyMethod === "lever_api") {
    const result =
      job.applyMethod === "greenhouse_api"
        ? await submitGreenhouse(job.atsBoardKey ?? "", job.sourceJobId, payload)
        : await submitLever(job.atsBoardKey ?? "", job.sourceJobId, payload);

    await upsertApplication(jobId, resume.id, {
      status: result.ok ? "submitted" : "failed",
      method: job.applyMethod,
      error: result.ok ? null : result.error ?? "unknown error",
      detail: result.detail ?? null,
      submittedAt: result.ok ? new Date() : null,
      incrementAttempt: true,
    });

    return {
      ...base,
      status: result.ok ? "submitted" : "failed",
      method: job.applyMethod,
      message: result.ok ? "Submitted through the ATS API" : result.error ?? "Submission failed",
    };
  }

  // --- Path 2: hand it to the browser worker -------------------------------
  const workerEnabled = process.env.APPLY_WORKER_ENABLED !== "0";
  await upsertApplication(jobId, resume.id, {
    status: workerEnabled ? "queued" : "needs_manual",
    method: workerEnabled ? "worker" : "manual",
    error: null,
    detail: null,
    submittedAt: null,
    incrementAttempt: false,
  });

  return {
    ...base,
    status: workerEnabled ? "queued" : "needs_manual",
    method: workerEnabled ? "worker" : "manual",
    message: workerEnabled
      ? "Queued — the browser worker will fill and submit it"
      : "Open the link and use the extension or bookmarklet to autofill",
  };
}

async function upsertApplication(
  jobId: string,
  resumeId: string,
  data: {
    status: string;
    method: string;
    error: string | null;
    detail: string | null;
    submittedAt: Date | null;
    incrementAttempt: boolean;
  },
) {
  const { incrementAttempt, ...fields } = data;
  await prisma.application.upsert({
    where: { jobId },
    create: { jobId, resumeId, ...fields, attempts: incrementAttempt ? 1 : 0 },
    update: {
      resumeId,
      ...fields,
      ...(incrementAttempt ? { attempts: { increment: 1 } } : {}),
    },
  });
}

/** Apply to many jobs, one at a time so we never hammer a single ATS. */
export async function applyToJobs(jobIds: string[], resumeId?: string | null) {
  const outcomes: ApplyOutcome[] = [];
  for (const id of jobIds) {
    try {
      outcomes.push(await applyToJob(id, resumeId));
    } catch (e: any) {
      outcomes.push({
        jobId: id,
        title: "?",
        company: "?",
        url: "",
        status: "failed",
        method: "none",
        message: String(e?.message ?? e).slice(0, 200),
      });
    }
  }
  return outcomes;
}

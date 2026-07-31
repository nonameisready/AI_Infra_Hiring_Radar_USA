import { greenhouseKeys, leverKeys } from "./keys";
import { greenhouseJobId } from "../ingest/greenhouse";
import { leverPostingId } from "../ingest/lever";

export type ApplicantPayload = {
  profile: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    location: string;
    linkedin: string;
    github: string;
    website: string;
    coverLetter: string;
  };
  resume: { fileName: string; mimeType: string; bytes: Buffer } | null;
};

export type DirectResult = { ok: boolean; detail?: string; error?: string };

function resumeBlob(resume: NonNullable<ApplicantPayload["resume"]>) {
  // Uint8Array keeps Blob happy across Node's undici and the edge runtime.
  return new Blob([new Uint8Array(resume.bytes)], { type: resume.mimeType });
}

/**
 * Greenhouse Job Board API — POST /v1/boards/{board}/jobs/{id}
 * Authenticated with the employer's job board API key as HTTP basic user.
 */
export async function submitGreenhouse(
  boardKey: string,
  sourceJobId: string,
  payload: ApplicantPayload,
): Promise<DirectResult> {
  const apiKey = greenhouseKeys()[boardKey];
  if (!apiKey) return { ok: false, error: `No Greenhouse board key configured for "${boardKey}"` };
  if (!payload.resume) return { ok: false, error: "A resume is required" };

  const form = new FormData();
  form.set("first_name", payload.profile.firstName);
  form.set("last_name", payload.profile.lastName);
  form.set("email", payload.profile.email);
  if (payload.profile.phone) form.set("phone", payload.profile.phone);
  if (payload.profile.location) form.set("location", payload.profile.location);
  if (payload.profile.coverLetter) form.set("cover_letter_text", payload.profile.coverLetter);
  form.set("resume", resumeBlob(payload.resume), payload.resume.fileName);

  const res = await fetch(
    `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(boardKey)}/jobs/${greenhouseJobId(sourceJobId)}`,
    {
      method: "POST",
      headers: { Authorization: `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}` },
      body: form,
      signal: AbortSignal.timeout(45_000),
    },
  );

  const text = await res.text();
  if (!res.ok) return { ok: false, error: `Greenhouse ${res.status}: ${text.slice(0, 300)}` };
  return { ok: true, detail: text.slice(0, 300) };
}

/**
 * Lever Postings API — POST /v0/postings/{site}/{postingId}?key=...
 */
export async function submitLever(
  siteKey: string,
  sourceJobId: string,
  payload: ApplicantPayload,
): Promise<DirectResult> {
  const apiKey = leverKeys()[siteKey];
  if (!apiKey) return { ok: false, error: `No Lever apply key configured for "${siteKey}"` };
  if (!payload.resume) return { ok: false, error: "A resume is required" };

  const form = new FormData();
  form.set("name", `${payload.profile.firstName} ${payload.profile.lastName}`.trim());
  form.set("email", payload.profile.email);
  if (payload.profile.phone) form.set("phone", payload.profile.phone);
  if (payload.profile.location) form.set("location", payload.profile.location);
  if (payload.profile.coverLetter) form.set("comments", payload.profile.coverLetter);
  if (payload.profile.linkedin) form.set("urls[LinkedIn]", payload.profile.linkedin);
  if (payload.profile.github) form.set("urls[GitHub]", payload.profile.github);
  if (payload.profile.website) form.set("urls[Portfolio]", payload.profile.website);
  form.set("resume", resumeBlob(payload.resume), payload.resume.fileName);

  const url = `https://api.lever.co/v0/postings/${encodeURIComponent(siteKey)}/${leverPostingId(sourceJobId)}?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, { method: "POST", body: form, signal: AbortSignal.timeout(45_000) });

  const text = await res.text();
  if (!res.ok) return { ok: false, error: `Lever ${res.status}: ${text.slice(0, 300)}` };
  return { ok: true, detail: text.slice(0, 300) };
}

import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { isSameOriginRequest, unauthorized } from "../../../lib/auth";

export const dynamic = "force-dynamic";

/**
 * State for the Jobright Agent tab. The agent's source of truth is the set of
 * JSON/markdown files under data/agent/, committed by the daily agent run —
 * the deployment picks them up on the next push, and a local `npm run dev`
 * sees them live. This route only reads and (locally) writes those files; the
 * browser work itself happens in the daily Claude session, not here.
 */
const DIR = path.join(process.cwd(), "data", "agent");

function readJson<T>(name: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(path.join(DIR, name), "utf8")) as T;
  } catch {
    return fallback;
  }
}

export async function GET() {
  const config = readJson<Record<string, unknown>>("config.json", {});
  const applied = readJson<{ updatedAt?: string; jobs: Record<string, any> }>("applied.json", { jobs: {} });
  const pending = readJson<{ updatedAt?: string; items: any[] }>("pending.json", { items: [] });
  const questions = readJson<{ open: any[]; answered: any[] }>("questions.json", { open: [], answered: [] });

  let appliedMd = "";
  try {
    appliedMd = fs.readFileSync(path.join(DIR, "APPLIED.md"), "utf8");
  } catch {
    /* first run — file not there yet */
  }

  const jobs = Object.values(applied.jobs ?? {});
  const byStatus: Record<string, number> = {};
  for (const j of jobs as Array<{ status?: string }>) {
    const s = j.status ?? "unknown";
    byStatus[s] = (byStatus[s] ?? 0) + 1;
  }

  return NextResponse.json({
    config,
    stats: {
      total: jobs.length,
      byStatus,
      pending: (pending.items ?? []).filter((i) => i.status !== "manual_done").length,
      openQuestions: (questions.open ?? []).length,
      lastRunAt: applied.updatedAt ?? null,
    },
    pending: pending.items ?? [],
    questions,
    appliedMd,
  });
}

/**
 * Local-only writes: answer an open question, or mark a pending job as
 * manually applied. On Vercel the filesystem is read-only, so the response
 * says the change did not persist and the tab falls back to a copy-paste
 * message for Claude instead.
 */
export async function POST(req: Request) {
  if (!isSameOriginRequest(req)) return unauthorized();
  const body = await req.json().catch(() => ({}));
  const now = new Date().toISOString();

  try {
    if (body.action === "answerQuestion" && body.id && typeof body.answer === "string") {
      const q = readJson<{ open: any[]; answered: any[]; [k: string]: any }>("questions.json", { open: [], answered: [] });
      const idx = q.open.findIndex((x) => x.id === body.id);
      if (idx < 0) return NextResponse.json({ error: "question not found" }, { status: 404 });
      const [item] = q.open.splice(idx, 1);
      q.answered.push({ ...item, answer: body.answer, answeredAt: now });
      q.updatedAt = now;
      fs.writeFileSync(path.join(DIR, "questions.json"), JSON.stringify(q, null, 2) + "\n");
      // The next agent run folds answered questions into profile.json and
      // memory.json (see agent/RUNBOOK.md) — this file is the handoff point.
      return NextResponse.json({ persisted: true });
    }

    if (body.action === "resolvePending" && body.id) {
      const p = readJson<{ items: any[]; [k: string]: any }>("pending.json", { items: [] });
      const item = p.items.find((x) => x.id === body.id);
      if (!item) return NextResponse.json({ error: "pending item not found" }, { status: 404 });
      item.status = "manual_done";
      item.resolvedAt = now;
      p.updatedAt = now;
      fs.writeFileSync(path.join(DIR, "pending.json"), JSON.stringify(p, null, 2) + "\n");
      return NextResponse.json({ persisted: true });
    }

    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  } catch {
    return NextResponse.json({ persisted: false, hint: "read-only deployment — use the copy button and tell Claude instead" });
  }
}

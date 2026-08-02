import { NextResponse } from "next/server";
import { runRefresh } from "../../../lib/ingest";
import { isAuthorizedOrSameOrigin, unauthorized } from "../../../lib/auth";

export const dynamic = "force-dynamic";
// 60s is the ceiling on Vercel's Hobby plan, and a deployment is rejected
// outright if this exceeds the plan limit. A full 108-board scan runs in
// 15-25s. If it ever does time out, the upserts already committed survive and
// the close-out pass simply does not run, so nothing is lost.
export const maxDuration = 60;

async function handle(req: Request) {
  // The Refresh button in the UI has no token to send, so same-origin
  // browser requests are allowed through alongside the cron/CLI token.
  if (!isAuthorizedOrSameOrigin(req)) return unauthorized();

  const url = new URL(req.url);
  const only = url.searchParams.get("companyIds");

  try {
    const summary = await runRefresh({
      companyIds: only ? only.split(",").filter(Boolean) : undefined,
    });
    return NextResponse.json({ ok: true, ...summary });
  } catch (e: any) {
    console.error("refresh failed", e);
    return NextResponse.json({ ok: false, error: String(e?.message ?? e) }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;

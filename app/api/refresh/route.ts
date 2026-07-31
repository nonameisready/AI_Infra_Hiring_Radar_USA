import { NextResponse } from "next/server";
import { runRefresh } from "../../../lib/ingest";
import { isAuthorized, unauthorized } from "../../../lib/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function handle(req: Request) {
  if (!isAuthorized(req)) return unauthorized();

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

import { NextResponse } from "next/server";

/**
 * Endpoints reached from outside the app itself — the cron job, the browser
 * worker and the Chrome extension — carry a shared token. If RADAR_TOKEN is
 * unset every request is allowed, which is what you want on localhost and not
 * what you want on a public deployment.
 */
export function tokenFromRequest(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  if (auth.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  const header = req.headers.get("x-radar-token");
  if (header) return header.trim();
  return new URL(req.url).searchParams.get("token")?.trim() ?? "";
}

export function isAuthorized(req: Request) {
  const expected = process.env.RADAR_TOKEN || process.env.CRON_SECRET;
  if (!expected) return true;
  const provided = tokenFromRequest(req);
  // Vercel Cron sends its own bearer, so accept either configured secret.
  return provided === expected || provided === process.env.CRON_SECRET;
}

export function unauthorized() {
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}

export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, authorization, x-radar-token",
};

export function corsPreflight() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

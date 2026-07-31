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

/**
 * Browsers set Sec-Fetch-Site on every fetch and script-set headers cannot
 * override it, so another website cannot make a visitor's browser send
 * "same-origin". It does stop nothing at all from a plain curl — which is fine
 * for the endpoints that use it, because the token exists to keep other sites
 * and stray crawlers from triggering expensive work, not to authenticate a
 * user. The app has no login; see the README on putting access control in
 * front of a public deployment.
 */
export function isSameOriginRequest(req: Request) {
  return req.headers.get("sec-fetch-site") === "same-origin";
}

/**
 * For endpoints the app's own UI calls. Without this, setting RADAR_TOKEN or
 * CRON_SECRET breaks the Refresh button, since the browser has no token to send.
 */
export function isAuthorizedOrSameOrigin(req: Request) {
  return isAuthorized(req) || isSameOriginRequest(req);
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

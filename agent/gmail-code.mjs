// Local Gmail reader for Greenhouse security codes — OAuth only, zero deps.
// NEVER touches the Google account password. Read-only scope.
//
// Files (all OUTSIDE the repo, in ~/.jobright-agent/, chmod 600):
//   gmail-oauth.json  {"client_id":"...","client_secret":"..."}   (you create once)
//   gmail-token.json  {"refresh_token":"..."}                     (written by gmail-auth.mjs)
//
// Usage from code:  const { waitForSecurityCode } = await import("./gmail-code.mjs");
// CLI test:         node agent/gmail-code.mjs        # prints the newest code, if any
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const CFG_DIR = path.join(os.homedir(), ".jobright-agent");
const OAUTH = path.join(CFG_DIR, "gmail-oauth.json");
const TOKEN = path.join(CFG_DIR, "gmail-token.json");

function creds() {
  if (!fs.existsSync(OAUTH) || !fs.existsSync(TOKEN)) {
    throw new Error(`Gmail OAuth not set up — see agent/RUNBOOK.md (need ${OAUTH} and ${TOKEN}; run node agent/gmail-auth.mjs once)`);
  }
  return { ...JSON.parse(fs.readFileSync(OAUTH, "utf8")), ...JSON.parse(fs.readFileSync(TOKEN, "utf8")) };
}

let cachedAccess = null; // { token, exp }
export async function accessToken() {
  if (cachedAccess && Date.now() < cachedAccess.exp - 60_000) return cachedAccess.token;
  const c = creds();
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: c.client_id, client_secret: c.client_secret,
      refresh_token: c.refresh_token, grant_type: "refresh_token",
    }),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error(`token refresh failed: ${JSON.stringify(j).slice(0, 200)}`);
  cachedAccess = { token: j.access_token, exp: Date.now() + (j.expires_in ?? 3600) * 1000 };
  return cachedAccess.token;
}

async function gmail(pathname) {
  const t = await accessToken();
  const r = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${pathname}`, {
    headers: { authorization: `Bearer ${t}` },
  });
  if (!r.ok) throw new Error(`gmail ${pathname} HTTP ${r.status}`);
  return r.json();
}

/** Newest Greenhouse security code received strictly after `afterMs` (epoch ms). */
export async function latestSecurityCode(afterMs = 0) {
  const q = encodeURIComponent('from:no-reply@us.greenhouse-mail.io subject:"security code" newer_than:1d');
  const list = await gmail(`messages?q=${q}&maxResults=5`);
  for (const m of list.messages ?? []) {
    const msg = await gmail(`messages/${m.id}?format=metadata&metadataHeaders=Subject`);
    if (Number(msg.internalDate) <= afterMs) continue;
    const code = (msg.snippet || "").match(/security code field on your application:?\s*([A-Za-z0-9]{6,12})/)?.[1];
    if (code) {
      const subj = msg.payload?.headers?.find((h) => h.name === "Subject")?.value ?? "";
      return { code, subject: subj, at: Number(msg.internalDate) };
    }
  }
  return null;
}

/** Poll until a fresh code arrives (Greenhouse sends within ~30s). */
export async function waitForSecurityCode(afterMs, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const hit = await latestSecurityCode(afterMs);
    if (hit) return hit;
    await new Promise((r) => setTimeout(r, 8000));
  }
  return null;
}

// CLI self-test
if (process.argv[1] && process.argv[1].endsWith("gmail-code.mjs")) {
  const hit = await latestSecurityCode(0);
  console.log(hit ? `✅ Gmail OAuth works — newest code ${hit.code} (${hit.subject})` : "✅ Gmail OAuth works — no recent security-code email found");
}

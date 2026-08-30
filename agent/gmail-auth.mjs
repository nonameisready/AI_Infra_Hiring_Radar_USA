// One-time Gmail OAuth authorization (loopback flow, zero deps, read-only scope).
// Prerequisite: ~/.jobright-agent/gmail-oauth.json with your OAuth client:
//   {"client_id":"....apps.googleusercontent.com","client_secret":"GOCSPX-..."}
// Run:  node agent/gmail-auth.mjs   → open the printed URL, approve, done.
// Writes ~/.jobright-agent/gmail-token.json (refresh token, chmod 600).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import crypto from "node:crypto";

const CFG_DIR = path.join(os.homedir(), ".jobright-agent");
const OAUTH = path.join(CFG_DIR, "gmail-oauth.json");
const TOKEN = path.join(CFG_DIR, "gmail-token.json");
const PORT = 8765;
const REDIRECT = `http://127.0.0.1:${PORT}/oauth`;
const SCOPE = "https://www.googleapis.com/auth/gmail.readonly";

if (!fs.existsSync(OAUTH)) {
  console.error(`Missing ${OAUTH} — create it first:\n  mkdir -p ~/.jobright-agent && chmod 700 ~/.jobright-agent`);
  console.error(`  echo '{"client_id":"YOUR_ID.apps.googleusercontent.com","client_secret":"YOUR_SECRET"}' > ${OAUTH} && chmod 600 ${OAUTH}`);
  process.exit(2);
}
const { client_id, client_secret } = JSON.parse(fs.readFileSync(OAUTH, "utf8"));

// PKCE
const verifier = crypto.randomBytes(48).toString("base64url");
const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");

const authUrl =
  "https://accounts.google.com/o/oauth2/v2/auth?" +
  new URLSearchParams({
    client_id, redirect_uri: REDIRECT, response_type: "code", scope: SCOPE,
    access_type: "offline", prompt: "consent",
    code_challenge: challenge, code_challenge_method: "S256",
  });

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, REDIRECT);
  if (u.pathname !== "/oauth") { res.writeHead(404).end(); return; }
  const code = u.searchParams.get("code");
  if (!code) { res.end("No code in callback."); return; }
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id, client_secret, code, code_verifier: verifier,
      grant_type: "authorization_code", redirect_uri: REDIRECT,
    }),
  });
  const j = await r.json();
  if (!j.refresh_token) {
    res.end("Token exchange failed — check the terminal.");
    console.error("Exchange failed:", JSON.stringify(j).slice(0, 300));
    process.exit(1);
  }
  fs.writeFileSync(TOKEN, JSON.stringify({ refresh_token: j.refresh_token }, null, 1), { mode: 0o600 });
  res.end("✅ Gmail authorized — you can close this tab.");
  console.log(`✅ Saved refresh token to ${TOKEN}`);
  console.log("Test it:  node agent/gmail-code.mjs");
  server.close();
});
server.listen(PORT, "127.0.0.1", () => {
  console.log("Open this URL in your browser and approve read-only Gmail access:\n");
  console.log(authUrl + "\n");
});

// Remote-controlled persistent browser. Poll ${site}-cmd.json for an action batch,
// execute, write ${site}-out.txt (dump + results). Never logs env secret values.
import { chromium } from "/home/user/AI_Infra_Hiring_Radar_USA/node_modules/playwright/index.mjs";
import fs from "node:fs";
import path from "node:path";
const WORK = process.env.AGENT_WORK_DIR;
const site = process.argv[2];
const startUrl = process.argv[3];
const CMD = path.join(WORK, `${site}-cmd.json`);
const OUT = path.join(WORK, `${site}-out.txt`);
fs.rmSync(CMD, { force: true });
const browser = await chromium.launch({
  headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH,
  proxy: { server: process.env.HTTPS_PROXY },
  args: ["--no-sandbox", "--disable-blink-features=AutomationControlled", "--ssl-version-max=tls1.2"],
});
const stateFile = path.join(WORK, `${site}-state.json`);
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 1500 },
  ...(fs.existsSync(stateFile) && process.argv[4] === "--resume" ? { storageState: stateFile } : {}),
});
let page = await ctx.newPage();
ctx.on("page", (p) => { page = p; });
const log = [];
const say = (m) => { log.push(m); console.log(m); };

const dump = async () => {
  try {
    return await page.evaluate(() => ({
      url: location.href,
      btns: Array.from(document.querySelectorAll('button, input[type="submit"], [role="button"], a.button')).filter((e) => e.offsetParent).map((e) => (e.innerText?.trim() || e.value || "").slice(0, 60)).filter(Boolean).slice(0, 40),
      inputs: Array.from(document.querySelectorAll("input,select,textarea")).filter((e) => e.type !== "hidden" && e.offsetParent).map((e, i) => `${i}|${e.tagName}:${e.type} name=${e.name} req=${e.required || e.getAttribute("aria-required")} label=${(e.labels?.[0]?.innerText ?? e.getAttribute("aria-label") ?? e.placeholder ?? "").replace(/\n/g, " ").slice(0, 80)} val=${e.type === "password" ? (e.value ? "***set***" : "") : (e.value ?? "").slice(0, 40)}`).slice(0, 80),
      text: document.body?.innerText?.replace(/\n{2,}/g, "\n").slice(0, 2200),
    }));
  } catch (e) { return { error: String(e.message) }; }
};
const writeOut = async (tag) => {
  const d = await dump();
  const p = path.join(WORK, `${site}-live.png`);
  await page.screenshot({ path: p, fullPage: true }).catch(() => {});
  fs.writeFileSync(OUT, `TAG:${tag}\nLOG:\n${log.join("\n")}\nDUMP:\n${JSON.stringify(d, null, 1)}\nSHOT:${p}\n`);
  log.length = 0;
};

const ACT = {
  goto: async (a) => { await page.goto(a.url, { waitUntil: "domcontentloaded", timeout: 90000 }); },
  fill: async (a) => { await page.locator(a.sel).first().fill(a.value, { timeout: 8000 }); },
  jsClick: async (a) => { await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) throw new Error("no element for " + sel);
    (el.labels && el.labels[0] ? el.labels[0] : el).click();
  }, a.sel); },
  fillEnv: async (a) => { const v = process.env[a.env] ?? ""; await page.locator(a.sel).first().fill(v); say(`fillEnv ${a.sel} <- ${a.env} (${v ? "set" : "EMPTY"})`); },
  typeSlow: async (a) => { const el = page.locator(a.sel).first(); await el.click(); await el.pressSequentially(a.value, { delay: 70 }); },
  fillLabel: async (a) => { await page.getByLabel(new RegExp(a.label, "i")).first().fill(a.value); },
  click: async (a) => { await page.locator(a.sel).first().click({ timeout: 10000 }); },
  clickNth: async (a) => { await page.locator(a.sel).nth(a.n).click(); },
  clickRole: async (a) => { await page.getByRole(a.role ?? "button", { name: new RegExp(a.name, "i") }).first().click(); },
  clickText: async (a) => { await page.getByText(new RegExp(a.textRe, "i")).first().click(); },
  check: async (a) => { await page.locator(a.sel).first().check({ timeout: 8000 }); },
  selectLabel: async (a) => { await page.locator(a.sel).first().selectOption({ label: a.option }, { timeout: 6000 }); },
  options: async (a) => {
    const res = await page.evaluate(({ sel, re }) => {
      const el = document.querySelector(sel);
      if (!el) return "no such select";
      const all = Array.from(el.options).map((o) => o.label || o.text);
      const rx = re ? new RegExp(re, "i") : null;
      return JSON.stringify(rx ? all.filter((l) => rx.test(l)) : all.slice(0, 60));
    }, { sel: a.sel, re: a.re });
    say(`OPTIONS ${a.sel}: ${res}`);
  },
  selectValue: async (a) => { await page.locator(a.sel).first().selectOption(a.value, { timeout: 6000 }); },
  selectByName: async (a) => { await page.locator(`select[name="${a.name}"]`).first().selectOption({ label: a.option }, { timeout: 6000 }); },
  upload: async (a) => { await page.locator(a.sel ?? 'input[type="file"]').first().setInputFiles(a.path); },
  uploadChooser: async (a) => {
    const [ch] = await Promise.all([page.waitForEvent("filechooser", { timeout: 15000 }), page.getByRole("button", { name: new RegExp(a.button, "i") }).first().click()]);
    await ch.setFiles(a.path);
  },
  digits: async (a) => {
    const cells = page.locator('input[type="number"], input[maxlength="1"]');
    for (let i = 0; i < a.code.length; i++) { await cells.nth(i).click(); await cells.nth(i).fill(a.code[i]); await page.waitForTimeout(200); }
  },
  press: async (a) => { await page.keyboard.press(a.key); },
  wait: async (a) => { await page.waitForTimeout(a.ms ?? 5000); },
  saveState: async () => { await ctx.storageState({ path: stateFile }); say("state saved"); },
  evalHtml: async (a) => { say(await page.evaluate((sel) => document.querySelector(sel)?.outerHTML?.slice(0, 3000) ?? "not found", a.sel)); },
  evalJs: async (a) => { say(String(await page.evaluate(a.code)).slice(0, 3500)); },
  frameDump: async () => { say(JSON.stringify(page.frames().map((f) => f.url()).slice(0, 10))); },
};

await ACT.goto({ url: startUrl });
await page.waitForTimeout(8000);
await writeOut("start");
say("READY");

const deadline = Date.now() + 180 * 60 * 1000;
let lastM = 0;
while (Date.now() < deadline) {
  await new Promise((r) => setTimeout(r, 2000));
  if (!fs.existsSync(CMD)) continue;
  const m = fs.statSync(CMD).mtimeMs;
  if (m <= lastM) continue;
  lastM = m;
  let batch;
  try { batch = JSON.parse(fs.readFileSync(CMD, "utf8")); } catch (e) { say("bad cmd json: " + e.message); continue; }
  if (batch.end) break;
  for (const a of batch.actions ?? []) {
    try { await ACT[a.do](a); say(`ok: ${a.do} ${a.sel ?? a.name ?? a.label ?? a.button ?? a.url ?? ""}`); }
    catch (e) { say(`FAIL: ${a.do} ${a.sel ?? a.name ?? ""} -> ${e.message.split("\n")[0]}`); }
    await page.waitForTimeout(a.settleMs ?? 1200);
  }
  await page.waitForTimeout(batch.settleMs ?? 2500);
  await writeOut("batch");
}
await ctx.storageState({ path: stateFile }).catch(() => {});
await writeOut("final");
await browser.close();
console.log("driver exit");

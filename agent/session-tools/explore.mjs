// Generic explorer: open URL, wait, screenshot, dump buttons/links/inputs.
import { chromium } from "/home/user/AI_Infra_Hiring_Radar_USA/node_modules/playwright/index.mjs";
import path from "node:path";
const WORK = process.env.AGENT_WORK_DIR;
const url = process.argv[2];
const stateFile = process.argv[3]; // optional storageState json to reuse
const tag = process.argv[4] ?? Date.now();
const browser = await chromium.launch({
  headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH,
  proxy: { server: process.env.HTTPS_PROXY },
  args: ["--no-sandbox", "--disable-blink-features=AutomationControlled", "--ssl-version-max=tls1.2"],
});
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 1400 },
  ...(stateFile && stateFile !== "-" ? { storageState: stateFile } : {}),
});
const page = await ctx.newPage();
try {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForTimeout(9000);
  console.log("URL:", page.url());
  console.log("TITLE:", await page.title());
  const info = await page.evaluate(() => {
    const vis = (e) => e.offsetParent !== null || e.tagName === "A";
    const btns = Array.from(document.querySelectorAll('button, a[role="button"], input[type="submit"]'))
      .filter(vis).map((e) => e.innerText?.trim() || e.value || e.getAttribute("aria-label")).filter(Boolean).slice(0, 40);
    const links = Array.from(document.querySelectorAll("a")).filter(vis)
      .map((e) => `${e.innerText?.trim().slice(0, 50)} -> ${e.href}`).filter((t) => /apply|sign|register|login|account/i.test(t)).slice(0, 20);
    const inputs = Array.from(document.querySelectorAll("input,select,textarea")).filter((e) => e.type !== "hidden")
      .map((e) => `${e.tagName}:${e.type ?? ""} name=${e.name} ph=${e.placeholder ?? ""} label=${(e.labels?.[0]?.innerText ?? e.getAttribute("aria-label") ?? "").slice(0, 60)}`).slice(0, 40);
    return { btns, links, inputs, bodyStart: document.body?.innerText?.slice(0, 600) };
  });
  console.log("BUTTONS:", JSON.stringify(info.btns, null, 1));
  console.log("APPLY/SIGN LINKS:", JSON.stringify(info.links, null, 1));
  console.log("INPUTS:", JSON.stringify(info.inputs, null, 1));
  console.log("BODY:", info.bodyStart);
  await page.screenshot({ path: path.join(WORK, `x-${tag}.png`), fullPage: false });
  console.log("shot:", path.join(WORK, `x-${tag}.png`));
} catch (e) { console.log("ERROR:", e.message); }
await browser.close();

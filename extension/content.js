/**
 * Injects a floating "Autofill" button on recognised application pages and runs
 * the shared runtime from autofill.js when it is clicked.
 */
(function () {
  "use strict";

  if (window.__radarPanelMounted) return;
  window.__radarPanelMounted = true;

  const STYLE = `
    position: fixed; right: 16px; bottom: 16px; z-index: 2147483647;
    display: flex; flex-direction: column; gap: 6px; align-items: flex-end;
    font: 13px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  `;

  const panel = document.createElement("div");
  panel.setAttribute("style", STYLE);

  const status = document.createElement("div");
  status.setAttribute(
    "style",
    "max-width:320px;padding:8px 10px;border-radius:8px;background:#101218;color:#e8eaf0;" +
      "border:1px solid #232733;box-shadow:0 8px 24px rgba(0,0,0,.4);display:none;white-space:pre-wrap;",
  );

  const row = document.createElement("div");
  row.setAttribute("style", "display:flex;gap:6px;");

  function makeButton(label, primary) {
    const b = document.createElement("button");
    b.textContent = label;
    b.setAttribute(
      "style",
      "padding:8px 12px;border-radius:8px;cursor:pointer;font-weight:600;font-size:13px;" +
        (primary
          ? "background:linear-gradient(180deg,#34d399,#10b981);color:#04120c;border:1px solid #059669;"
          : "background:#14171f;color:#8b93a7;border:1px solid #232733;"),
    );
    return b;
  }

  const fillBtn = makeButton("⚡ Autofill", true);
  const submitBtn = makeButton("Fill + submit", false);
  const hideBtn = makeButton("✕", false);

  row.append(fillBtn, submitBtn, hideBtn);
  panel.append(status, row);

  function show(text, ms) {
    status.textContent = text;
    status.style.display = "block";
    if (ms) setTimeout(() => (status.style.display = "none"), ms);
  }

  function trackGuess() {
    const t = (document.title + " " + location.pathname).toLowerCase();
    return /forward.deployed|\bfde\b|solutions engineer|field engineer/.test(t) ? "fde" : "ai";
  }

  function jobIdFromUrl() {
    return new URLSearchParams(location.search).get("radarJobId");
  }

  async function run(submit) {
    fillBtn.disabled = submitBtn.disabled = true;
    show("Fetching your profile and resume…");

    try {
      const reply = await chrome.runtime.sendMessage({
        type: "getPayload",
        track: trackGuess(),
        jobId: jobIdFromUrl(),
      });

      if (!reply || !reply.ok) throw new Error(reply ? reply.error : "no response from the radar");
      const payload = reply.data;

      if (!payload.profile || !payload.profile.email) {
        throw new Error("Your radar profile has no email yet — fill it in first.");
      }

      const report = await window.__radarAutofill(payload, { submit, overwrite: false });

      let msg = `Filled ${report.filled.length} field${report.filled.length === 1 ? "" : "s"}`;
      msg += report.resumeAttached ? `\nResume attached: ${payload.resume.fileName}` : "";
      if (report.fileInputs && !report.resumeAttached) {
        msg += `\n⚠ ${report.fileInputs} upload field(s) — attach the resume yourself`;
      }
      if (report.skipped.length) {
        msg += `\nSkipped: ${report.skipped.slice(0, 4).map((s) => s.label).join(", ")}`;
      }
      if (report.submitted) msg += "\n✓ Submitted";
      show(msg, 15000);

      const jobId = jobIdFromUrl();
      if (jobId) {
        chrome.runtime.sendMessage({
          type: "reportFilled",
          jobId,
          submitted: report.submitted,
          detail: JSON.stringify({
            filled: report.filled.length,
            skipped: report.skipped.slice(0, 8),
            url: location.href,
          }),
        });
      }
    } catch (e) {
      show(`Autofill failed: ${e.message}`, 12000);
    } finally {
      fillBtn.disabled = submitBtn.disabled = false;
    }
  }

  fillBtn.addEventListener("click", () => run(false));
  submitBtn.addEventListener("click", () => {
    if (confirm("Fill this form and submit the application right away?")) run(true);
  });
  hideBtn.addEventListener("click", () => panel.remove());

  // Only bother mounting where there is actually something to fill.
  function hasForm() {
    return (
      document.querySelector('input[type="file"]') ||
      document.querySelector('input[type="email"]') ||
      /apply|application/i.test(location.pathname)
    );
  }

  function mount() {
    if (hasForm() && document.body && !document.body.contains(panel)) {
      document.body.appendChild(panel);
    }
  }

  mount();
  // Single-page ATS apps mount the form after the first paint.
  const observer = new MutationObserver(() => mount());
  observer.observe(document.documentElement, { childList: true, subtree: true });
  setTimeout(() => observer.disconnect(), 30000);
})();

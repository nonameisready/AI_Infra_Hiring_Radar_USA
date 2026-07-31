/**
 * Shared autofill runtime for AI Hiring Radar.
 *
 * Loaded by three different callers, all of which hand it the same payload:
 *   1. the Chrome extension content script (can attach the resume file),
 *   2. the Playwright worker in worker/auto-apply.mjs,
 *   3. the zero-install bookmarklet (text fields only).
 *
 * It must stay dependency-free ES5-ish so it can be injected anywhere.
 *
 * window.__radarAutofill(payload, opts) -> Promise<Report>
 *   payload = { profile, resume: { fileName, mimeType, base64 } | null, job }
 *   opts    = { submit: bool, overwrite: bool, highlight: bool }
 */
(function () {
  "use strict";

  var MAX_PART = 220;

  function norm(s) {
    return String(s || "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  function visible(el) {
    if (!el) return false;
    if (el.type === "hidden") return false;
    if (el.disabled || el.readOnly) return false;
    if (el.getClientRects().length === 0) return false;
    var st = window.getComputedStyle(el);
    return st.visibility !== "hidden" && st.display !== "none";
  }

  /** Everything a human would read as "the question this field is asking". */
  function contextOf(el) {
    var parts = [];
    function push(s) {
      if (s) parts.push(String(s).slice(0, MAX_PART));
    }

    if (el.id) {
      try {
        var l = document.querySelector('label[for="' + (window.CSS && CSS.escape ? CSS.escape(el.id) : el.id) + '"]');
        if (l) push(l.innerText);
      } catch (e) {}
    }
    var wrap = el.closest && el.closest("label");
    if (wrap) push(wrap.innerText);
    push(el.getAttribute("aria-label"));
    var ariaBy = el.getAttribute("aria-labelledby");
    if (ariaBy) {
      ariaBy.split(/\s+/).forEach(function (id) {
        var n = document.getElementById(id);
        if (n) push(n.innerText);
      });
    }
    push(el.name);
    push(el.id);
    push(el.placeholder);
    push(el.getAttribute("data-testid"));

    var fs = el.closest && el.closest("fieldset");
    if (fs) {
      var lg = fs.querySelector("legend");
      if (lg) push(lg.innerText);
    }

    // Walk up a few levels looking for the question text of the field group.
    var node = el.parentElement;
    for (var depth = 0; node && depth < 4; depth++, node = node.parentElement) {
      var cls = norm(node.className);
      if (/field|question|form-group|input|application|form-row|select/.test(cls)) {
        var lbl = node.querySelector("label, legend, .label, [class*='label']");
        if (lbl) push(lbl.innerText);
        break;
      }
    }

    return norm(parts.join(" | "));
  }

  /** Assign a value in a way React / Vue controlled inputs actually notice. */
  function setNativeValue(el, value) {
    var proto =
      el.tagName === "TEXTAREA" ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    var desc = Object.getOwnPropertyDescriptor(proto, "value");
    if (desc && desc.set) desc.set.call(el, value);
    else el.value = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function flash(el, ok) {
    try {
      el.style.transition = "outline-color .4s";
      el.style.outline = "2px solid " + (ok ? "#22c55e" : "#f59e0b");
      el.style.outlineOffset = "1px";
      setTimeout(function () {
        el.style.outline = "";
      }, 2500);
    } catch (e) {}
  }

  function sleep(ms) {
    return new Promise(function (r) {
      setTimeout(r, ms);
    });
  }

  // ---------------------------------------------------------------- selects

  function optionScore(text, want) {
    var t = norm(text);
    var w = norm(want);
    if (!t || !w) return 0;
    if (t === w) return 100;
    if (t.replace(/[^a-z]/g, "") === w.replace(/[^a-z]/g, "")) return 95;
    if (t.indexOf(w) === 0 || w.indexOf(t) === 0) return 80;
    if (t.indexOf(w) >= 0 || w.indexOf(t) >= 0) return 60;
    return 0;
  }

  function fillSelect(el, want) {
    var best = null;
    var bestScore = 0;
    for (var i = 0; i < el.options.length; i++) {
      var o = el.options[i];
      if (!o.value && !norm(o.text)) continue;
      var s = Math.max(optionScore(o.text, want), optionScore(o.value, want));
      if (s > bestScore) {
        bestScore = s;
        best = o;
      }
    }
    if (!best || bestScore < 60) return false;
    el.value = best.value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }

  /** react-select / Ashby style comboboxes: type, wait for the listbox, click. */
  async function fillCombobox(el, want) {
    el.focus();
    setNativeValue(el, String(want).slice(0, 40));
    el.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "a" }));
    await sleep(450);

    var listId = el.getAttribute("aria-controls") || el.getAttribute("aria-owns");
    var list = listId ? document.getElementById(listId) : null;
    var opts = list
      ? list.querySelectorAll('[role="option"], li, div')
      : document.querySelectorAll('[role="option"]');

    var best = null;
    var bestScore = 0;
    for (var i = 0; i < opts.length; i++) {
      var txt = opts[i].innerText;
      if (!txt) continue;
      var s = optionScore(txt, want);
      if (s > bestScore) {
        bestScore = s;
        best = opts[i];
      }
    }
    if (best && bestScore >= 60) {
      best.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      best.click();
      await sleep(150);
      return true;
    }
    // Fall back to keyboard selection of the first suggestion.
    el.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "ArrowDown", keyCode: 40 }));
    el.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Enter", keyCode: 13 }));
    await sleep(150);
    return Boolean(el.value);
  }

  /** Radio / checkbox groups sharing a name or a fieldset. */
  function fillRadioGroup(el, want) {
    var group = [];
    if (el.name) {
      group = Array.prototype.slice.call(
        document.querySelectorAll('input[type="radio"][name="' + el.name.replace(/"/g, '\\"') + '"]'),
      );
    }
    if (!group.length) {
      var fs = el.closest("fieldset") || el.parentElement;
      group = fs ? Array.prototype.slice.call(fs.querySelectorAll('input[type="radio"]')) : [el];
    }

    var best = null;
    var bestScore = 0;
    group.forEach(function (r) {
      var txt = contextOf(r);
      // Prefer the option's own label over the shared question text.
      var own = "";
      var lw = r.closest("label");
      if (lw) own = lw.innerText;
      else if (r.id) {
        var l2 = document.querySelector('label[for="' + r.id + '"]');
        if (l2) own = l2.innerText;
      }
      var s = Math.max(optionScore(own, want), optionScore(r.value, want), optionScore(txt, want) * 0.4);
      if (s > bestScore) {
        bestScore = s;
        best = r;
      }
    });

    if (!best || bestScore < 60) return false;
    best.click();
    if (!best.checked) {
      best.checked = true;
      best.dispatchEvent(new Event("change", { bubbles: true }));
    }
    return true;
  }

  // ------------------------------------------------------------------ rules

  function yesNo(v) {
    return v ? "Yes" : "No";
  }

  function buildRules(p) {
    var full = [p.firstName, p.lastName].filter(Boolean).join(" ");
    return [
      // Names — the specific ones must be tested before the generic "name".
      [/\b(first|given|fore)\s*name\b|^first_name|\bfname\b/, p.firstName],
      [/\b(last|family|sur)\s*name\b|^last_name|\blname\b/, p.lastName],
      [/\bpreferred\s*(first\s*)?name\b|\bnickname\b/, p.firstName],
      [/\bfull\s*name\b|^name$|\byour name\b|\blegal name\b/, full],

      [/\be-?mail\b/, p.email],
      [/\b(phone|mobile|cell|telephone)\b/, p.phone],

      [/\blinked\s*-?in\b/, p.linkedin],
      [/\bgithub\b/, p.github],
      [/\b(portfolio|personal (site|website)|website|your site|url)\b/, p.website],
      [/\btwitter\b|\bx\.com\b/, ""],

      [
        /\b(city|location|where are you (based|located)|current (city|location)|address)\b/,
        p.location,
      ],

      [/\bcover letter\b|\bwhy do you want\b|\btell us about\b|\badditional information\b/, p.coverLetter],
      [/\bhow did you (hear|find out)\b|\breferral source\b/, "Company website"],

      // Work authorization — sponsorship is checked first because those
      // questions usually also contain the word "authorized".
      [
        /\b(sponsor|sponsorship|visa support|h-?1b|require.*visa|now or in the future.*sponsor)\b/,
        yesNo(p.needsSponsor),
      ],
      [
        /\b(legally authorized|authorized to work|work authorization|eligible to work|right to work)\b/,
        yesNo(p.usAuthorized),
      ],
      [/\b(work authorization status|citizenship|immigration status)\b/, p.workAuth],

      // EEO
      [/\bgender\b|\bwhat is your sex\b/, p.gender],
      [/\brace\b|\bethnicit/, p.race],
      [/\bveteran\b|\bmilitary\b/, p.veteran],
      [/\bdisabilit/, p.disability],

      [/\b(pronouns)\b/, ""],
      [/\b(desired|expected)\s*(salary|compensation)\b/, ""],
      [/\b(notice period|start date|available to start)\b/, ""],
    ].filter(function (r) {
      return r[1] !== "" && r[1] != null;
    });
  }

  function matchValue(ctx, rules, custom) {
    for (var i = 0; i < custom.length; i++) {
      var c = custom[i];
      if (!c || !c.match) continue;
      try {
        if (new RegExp(c.match, "i").test(ctx)) return c.value;
      } catch (e) {
        if (ctx.indexOf(norm(c.match)) >= 0) return c.value;
      }
    }
    for (var j = 0; j < rules.length; j++) {
      if (rules[j][0].test(ctx)) return rules[j][1];
    }
    return null;
  }

  // ------------------------------------------------------------------- file

  function base64ToFile(b64, name, mime) {
    var bin = atob(b64);
    var len = bin.length;
    var bytes = new Uint8Array(len);
    for (var i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
    return new File([bytes], name, { type: mime || "application/pdf" });
  }

  function attachResume(payload, report) {
    if (!payload.resume || !payload.resume.base64) return;
    var inputs = Array.prototype.slice.call(document.querySelectorAll('input[type="file"]'));
    if (!inputs.length) return;

    var file;
    try {
      file = base64ToFile(payload.resume.base64, payload.resume.fileName, payload.resume.mimeType);
    } catch (e) {
      report.skipped.push({ label: "resume", reason: "could not decode file: " + e.message });
      return;
    }

    inputs.forEach(function (input) {
      var ctx = contextOf(input);
      // Skip inputs that clearly want something other than a resume.
      if (/cover letter|transcript|portfolio file|photo|avatar/.test(ctx)) return;
      try {
        var dt = new DataTransfer();
        dt.items.add(file);
        input.files = dt.files;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
        report.resumeAttached = true;
        report.filled.push({ label: "resume", value: payload.resume.fileName });
        flash(input, true);
      } catch (e) {
        report.skipped.push({ label: "resume", reason: "file input is protected: " + e.message });
      }
    });
  }

  // ----------------------------------------------------------------- submit

  function findSubmit() {
    var cands = Array.prototype.slice.call(
      document.querySelectorAll('button, input[type="submit"], [role="button"]'),
    );
    var best = null;
    for (var i = 0; i < cands.length; i++) {
      var el = cands[i];
      if (!visible(el)) continue;
      var t = norm(el.innerText || el.value);
      if (!t) continue;
      if (/^(submit application|submit|apply now|send application|submit my application)$/.test(t)) return el;
      if (/submit|apply/.test(t) && !/save|later|linkedin|indeed|autofill|attach/.test(t)) best = best || el;
    }
    return best;
  }

  // ------------------------------------------------------------------- main

  window.__radarAutofill = async function (payload, opts) {
    opts = opts || {};
    var p = (payload && payload.profile) || {};
    var custom = [];
    try {
      custom = typeof p.customAnswers === "string" ? JSON.parse(p.customAnswers) : p.customAnswers || [];
    } catch (e) {
      custom = [];
    }

    var report = {
      url: location.href,
      filled: [],
      skipped: [],
      resumeAttached: false,
      submitted: false,
      fileInputs: document.querySelectorAll('input[type="file"]').length,
    };

    var rules = buildRules(p);
    var fields = Array.prototype.slice.call(
      document.querySelectorAll("input, textarea, select"),
    );

    var seenRadioGroups = {};

    for (var i = 0; i < fields.length; i++) {
      var el = fields[i];
      var type = (el.type || "").toLowerCase();

      if (type === "file" || type === "hidden" || type === "submit" || type === "button") continue;
      if (!visible(el)) continue;

      var ctx = contextOf(el);
      if (!ctx) continue;

      var want = matchValue(ctx, rules, custom);
      if (want == null || want === "") continue;

      try {
        if (type === "radio") {
          var key = el.name || ctx.slice(0, 60);
          if (seenRadioGroups[key]) continue;
          seenRadioGroups[key] = true;
          if (fillRadioGroup(el, want)) report.filled.push({ label: ctx.slice(0, 70), value: want });
          else report.skipped.push({ label: ctx.slice(0, 70), reason: "no matching option" });
          continue;
        }

        if (type === "checkbox") {
          var shouldCheck = /^(yes|true)$/i.test(String(want));
          if (el.checked !== shouldCheck) el.click();
          report.filled.push({ label: ctx.slice(0, 70), value: yesNo(shouldCheck) });
          continue;
        }

        if (el.tagName === "SELECT") {
          if (el.value && !opts.overwrite && el.selectedIndex > 0) continue;
          if (fillSelect(el, want)) {
            report.filled.push({ label: ctx.slice(0, 70), value: want });
            flash(el, true);
          } else {
            report.skipped.push({ label: ctx.slice(0, 70), reason: "no matching option" });
            flash(el, false);
          }
          continue;
        }

        if (el.value && !opts.overwrite) continue;

        var role = el.getAttribute("role");
        if (role === "combobox" || el.getAttribute("aria-autocomplete")) {
          var ok = await fillCombobox(el, want);
          if (ok) report.filled.push({ label: ctx.slice(0, 70), value: want });
          else report.skipped.push({ label: ctx.slice(0, 70), reason: "combobox had no match" });
          flash(el, ok);
          continue;
        }

        setNativeValue(el, String(want));
        report.filled.push({ label: ctx.slice(0, 70), value: String(want).slice(0, 60) });
        flash(el, true);
      } catch (e) {
        report.skipped.push({ label: ctx.slice(0, 70), reason: String(e && e.message) });
      }
    }

    attachResume(payload, report);

    if (report.fileInputs > 0 && !report.resumeAttached) {
      report.skipped.push({
        label: "resume",
        reason: payload.resume ? "file input rejected the attachment" : "no resume in payload",
      });
    }

    if (opts.submit) {
      var btn = findSubmit();
      if (btn) {
        btn.click();
        report.submitted = true;
        report.submitLabel = norm(btn.innerText || btn.value);
      } else {
        report.skipped.push({ label: "submit", reason: "no submit button found" });
      }
    }

    return report;
  };

  window.__radarAutofillVersion = 2;
})();

"use client";

import { useEffect, useState } from "react";
import { Profile, ResumeMeta, api, formatBytes } from "../lib/client";

type Tab = "profile" | "resumes" | "autofill" | "sources";

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "profile", label: "Profile" },
  { id: "resumes", label: "Resumes" },
  { id: "autofill", label: "Auto-apply setup" },
  { id: "sources", label: "Job boards" },
];

export function SettingsDrawer({
  open,
  onClose,
  resumes,
  onResumesChanged,
}: {
  open: boolean;
  onClose: () => void;
  resumes: ResumeMeta[];
  onResumesChanged: () => void;
}) {
  const [tab, setTab] = useState<Tab>("profile");

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    if (open) document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <aside className="relative flex h-full w-full max-w-2xl flex-col border-l border-[color:var(--line)] bg-[color:var(--bg)] shadow-2xl">
        <header className="flex items-center justify-between border-b border-[color:var(--line)] px-5 py-3">
          <h2 className="text-sm font-semibold">Settings</h2>
          <button className="btn btn-xs btn-ghost" onClick={onClose}>
            Close ✕
          </button>
        </header>

        <nav className="flex gap-1 border-b border-[color:var(--line)] px-3 py-2">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={`chip ${tab === t.id ? "chip-on" : ""}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>

        <div className="flex-1 overflow-y-auto p-5">
          {tab === "profile" && <ProfilePanel />}
          {tab === "resumes" && <ResumesPanel resumes={resumes} onChanged={onResumesChanged} />}
          {tab === "autofill" && <AutofillPanel />}
          {tab === "sources" && <SourcesPanel />}
        </div>
      </aside>
    </div>
  );
}

// ---------------------------------------------------------------- profile

const FIELDS: Array<{ key: keyof Profile; label: string; type?: string; placeholder?: string }> = [
  { key: "firstName", label: "First name" },
  { key: "lastName", label: "Last name" },
  { key: "email", label: "Email", type: "email" },
  { key: "phone", label: "Phone", placeholder: "+1 415 555 0100" },
  { key: "location", label: "Location", placeholder: "San Francisco, CA" },
  { key: "linkedin", label: "LinkedIn", placeholder: "https://linkedin.com/in/…" },
  { key: "github", label: "GitHub", placeholder: "https://github.com/…" },
  { key: "website", label: "Portfolio / website" },
  { key: "workAuth", label: "Work authorization", placeholder: "US Citizen" },
  { key: "gender", label: "Gender (EEO)", placeholder: "Decline to self identify" },
  { key: "race", label: "Race / ethnicity (EEO)", placeholder: "Decline to self identify" },
  { key: "veteran", label: "Veteran status (EEO)", placeholder: "I am not a protected veteran" },
  { key: "disability", label: "Disability status (EEO)", placeholder: "No, I do not have a disability" },
];

function ProfilePanel() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [custom, setCustom] = useState<Array<{ match: string; value: string }>>([]);

  useEffect(() => {
    api<{ profile: Profile }>("/api/profile")
      .then(({ profile }) => {
        setProfile(profile);
        try {
          setCustom(JSON.parse(profile.customAnswers || "[]"));
        } catch {
          setCustom([]);
        }
      })
      .catch((e) => setError(String(e.message)));
  }, []);

  async function save() {
    if (!profile) return;
    setSaving(true);
    setError(null);
    try {
      await api("/api/profile", {
        method: "PUT",
        body: JSON.stringify({ ...profile, customAnswers: custom.filter((c) => c.match && c.value) }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e: any) {
      setError(String(e.message));
    } finally {
      setSaving(false);
    }
  }

  if (!profile) return <p className="text-sm text-[color:var(--muted)]">Loading…</p>;

  const set = (patch: Partial<Profile>) => setProfile({ ...profile, ...patch });

  return (
    <div className="space-y-5">
      <p className="text-xs text-[color:var(--muted)]">
        These answers are what the autofiller types into every application form. Name and email are
        required before you can apply.
      </p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {FIELDS.map((f) => (
          <div key={f.key}>
            <label className="label" htmlFor={`p-${f.key}`}>
              {f.label}
            </label>
            <input
              id={`p-${f.key}`}
              className="input"
              type={f.type ?? "text"}
              placeholder={f.placeholder}
              value={String(profile[f.key] ?? "")}
              onChange={(e) => set({ [f.key]: e.target.value } as Partial<Profile>)}
            />
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-4">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="h-4 w-4 accent-emerald-500"
            checked={profile.usAuthorized}
            onChange={(e) => set({ usAuthorized: e.target.checked })}
          />
          Authorized to work in the US
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="h-4 w-4 accent-emerald-500"
            checked={profile.needsSponsor}
            onChange={(e) => set({ needsSponsor: e.target.checked })}
          />
          Will need visa sponsorship
        </label>
      </div>

      <div>
        <label className="label" htmlFor="p-cover">
          Default cover letter / “why this company”
        </label>
        <textarea
          id="p-cover"
          className="input min-h-[120px] resize-y"
          value={profile.coverLetter}
          onChange={(e) => set({ coverLetter: e.target.value })}
          placeholder="Used for cover letter and free-text fields."
        />
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="label mb-0">Custom answers</span>
          <button
            className="btn btn-xs"
            onClick={() => setCustom([...custom, { match: "", value: "" }])}
          >
            + Add
          </button>
        </div>
        <p className="mb-2 text-xs text-[color:var(--muted)]">
          Matched against the question text before the built-in rules. The left side is a regular
          expression, e.g. <code className="text-[color:var(--text)]">salary|compensation</code>.
        </p>
        <div className="space-y-2">
          {custom.map((c, i) => (
            <div key={i} className="flex gap-2">
              <input
                className="input flex-1"
                placeholder="question matches…"
                value={c.match}
                onChange={(e) => {
                  const next = [...custom];
                  next[i] = { ...next[i], match: e.target.value };
                  setCustom(next);
                }}
              />
              <input
                className="input flex-1"
                placeholder="answer"
                value={c.value}
                onChange={(e) => {
                  const next = [...custom];
                  next[i] = { ...next[i], value: e.target.value };
                  setCustom(next);
                }}
              />
              <button
                className="btn btn-xs btn-ghost"
                onClick={() => setCustom(custom.filter((_, j) => j !== i))}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      </div>

      {error && <p className="text-sm text-rose-300">{error}</p>}

      <div className="flex items-center gap-3">
        <button className="btn btn-primary" onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save profile"}
        </button>
        {saved && <span className="text-xs text-emerald-300">Saved</span>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- resumes

function ResumesPanel({ resumes, onChanged }: { resumes: ResumeMeta[]; onChanged: () => void }) {
  async function update(id: string, patch: Record<string, unknown>) {
    await api(`/api/resumes/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
    onChanged();
  }

  if (!resumes.length) {
    return (
      <p className="text-sm text-[color:var(--muted)]">
        No resumes yet. Upload one from either tab — the tab you upload from decides which track it
        defaults to.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {resumes.map((r) => (
        <div key={r.id} className="panel-soft flex flex-wrap items-center gap-3 p-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-medium">{r.label}</span>
              {r.isDefault && <span className="tag">default</span>}
            </div>
            <p className="mt-0.5 truncate text-xs text-[color:var(--muted)]">
              {r.fileName} · {formatBytes(r.size)} · {r.applicationCount} application
              {r.applicationCount === 1 ? "" : "s"}
            </p>
          </div>

          <select
            className="input w-auto"
            value={r.track}
            onChange={(e) => update(r.id, { track: e.target.value })}
          >
            <option value="ai">AI track</option>
            <option value="fde">FDE track</option>
            <option value="any">Both</option>
          </select>

          {!r.isDefault && (
            <button className="btn btn-xs" onClick={() => update(r.id, { isDefault: true })}>
              Make default
            </button>
          )}
          <a className="btn btn-xs btn-ghost" href={`/api/resumes/${r.id}`} target="_blank" rel="noreferrer">
            Open
          </a>
        </div>
      ))}
    </div>
  );
}

// --------------------------------------------------------------- autofill

function AutofillPanel() {
  const [bookmarklet, setBookmarklet] = useState<string>("");
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
    api<{ bookmarklet: string }>("/api/autofill/bookmarklet")
      .then((d) => setBookmarklet(d.bookmarklet))
      .catch(() => setBookmarklet(""));
  }, []);

  return (
    <div className="space-y-6 text-sm">
      <section>
        <h3 className="mb-1 font-semibold">How “Apply” actually submits</h3>
        <p className="text-xs leading-relaxed text-[color:var(--muted)]">
          No public ATS lets a third party submit an application on your behalf without the
          employer&apos;s own API key — Greenhouse and Lever both gate their apply endpoints. So this app
          uses three paths, in order of how hands-off they are.
        </p>
      </section>

      <section className="panel-soft p-3">
        <h4 className="font-medium">1 · Browser worker (fully automatic)</h4>
        <p className="mt-1 text-xs text-[color:var(--muted)]">
          Runs Chromium on your machine, opens each queued job, fills the form, attaches the right
          resume and submits. This is what “Apply” queues by default.
        </p>
        <pre className="mt-2 overflow-x-auto rounded-md bg-black/40 p-2 text-[11px] leading-relaxed">
{`npm run worker            # fills forms, stops before submitting
npm run worker -- --submit  # actually submits`}
        </pre>
      </section>

      <section className="panel-soft p-3">
        <h4 className="font-medium">2 · Chrome extension (one click, your own browser)</h4>
        <p className="mt-1 text-xs text-[color:var(--muted)]">
          Keeps your logged-in sessions and can attach the resume file, which a bookmarklet cannot.
          Load <code>extension/</code> at <code>chrome://extensions</code> → Developer mode → Load
          unpacked, then set the radar URL to <code>{origin}</code> in the popup.
        </p>
      </section>

      <section className="panel-soft p-3">
        <h4 className="font-medium">3 · Bookmarklet (nothing to install)</h4>
        <p className="mt-1 text-xs text-[color:var(--muted)]">
          Drag the link below to your bookmarks bar. On any application page it fills every text
          field it recognises. Greenhouse and Ashby send <code>connect-src &apos;self&apos;</code>, so it
          cannot pull your resume file down — attach that one yourself.
        </p>
        {bookmarklet ? (
          <a
            href={bookmarklet}
            className="btn btn-xs mt-2 inline-block"
            onClick={(e) => e.preventDefault()}
            draggable
          >
            ⚡ Radar Autofill
          </a>
        ) : (
          <p className="mt-2 text-xs text-[color:var(--muted)]">Generating…</p>
        )}
      </section>

      <p className="text-xs text-[color:var(--muted)]">
        Whatever the path, review before you submit. Auto-submission is opt-in for a reason: a
        garbled answer on a form goes to a real hiring team.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------- sources

type CompanyRow = {
  id: string;
  name: string;
  atsType: string | null;
  atsKey: string | null;
  starred: boolean;
  disabled: boolean;
  jobCount: number;
  tracks: { ai: number; fde: number };
};

function SourcesPanel() {
  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [form, setForm] = useState({ name: "", atsType: "greenhouse", atsKey: "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = () =>
    api<{ companies: CompanyRow[] }>("/api/sources").then((d) => setCompanies(d.companies));

  useEffect(() => {
    load().catch(() => {});
  }, []);

  async function add() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await api<{ postings: number }>("/api/sources", {
        method: "POST",
        body: JSON.stringify(form),
      });
      setMsg(`Added — the board returned ${res.postings} postings. Run a refresh to pull them in.`);
      setForm({ name: "", atsType: form.atsType, atsKey: "" });
      await load();
    } catch (e: any) {
      setMsg(String(e.message));
    } finally {
      setBusy(false);
    }
  }

  async function toggle(id: string, patch: Record<string, boolean>) {
    await api("/api/sources", { method: "PATCH", body: JSON.stringify({ id, ...patch }) });
    load();
  }

  return (
    <div className="space-y-4">
      <div className="panel-soft space-y-2 p-3">
        <h4 className="text-sm font-medium">Add a job board</h4>
        <p className="text-xs text-[color:var(--muted)]">
          The board token is the slug in the careers URL — <code>boards.greenhouse.io/<b>anthropic</b></code>,
          <code> jobs.lever.co/<b>palantir</b></code>, <code>jobs.ashbyhq.com/<b>openai</b></code>. It is
          checked against the live API before being saved.
        </p>
        <div className="flex flex-wrap gap-2">
          <input
            className="input flex-1"
            placeholder="Company name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <select
            className="input w-auto"
            value={form.atsType}
            onChange={(e) => setForm({ ...form, atsType: e.target.value })}
          >
            <option value="greenhouse">Greenhouse</option>
            <option value="lever">Lever</option>
            <option value="ashby">Ashby</option>
          </select>
          <input
            className="input flex-1"
            placeholder="board token"
            value={form.atsKey}
            onChange={(e) => setForm({ ...form, atsKey: e.target.value })}
          />
          <button className="btn btn-primary" disabled={busy || !form.atsKey} onClick={add}>
            {busy ? "Checking…" : "Verify & add"}
          </button>
        </div>
        {msg && <p className="text-xs text-[color:var(--muted)]">{msg}</p>}
      </div>

      <div className="space-y-1">
        {companies.map((c) => (
          <div
            key={c.id}
            className={`panel-soft flex items-center gap-3 px-3 py-2 text-sm ${c.disabled ? "opacity-40" : ""}`}
          >
            <button
              className="text-xs"
              title={c.starred ? "Unstar" : "Mark as priority"}
              onClick={() => toggle(c.id, { starred: !c.starred })}
            >
              <span className={c.starred ? "text-amber-400" : "text-[color:var(--muted)]"}>★</span>
            </button>
            <span className="min-w-0 flex-1 truncate">{c.name}</span>
            <span className="text-xs text-[color:var(--muted)]">
              {c.atsType}:{c.atsKey}
            </span>
            <span className="text-xs tabular-nums text-emerald-300/80">{c.tracks.ai} ai</span>
            <span className="text-xs tabular-nums text-violet-300/80">{c.tracks.fde} fde</span>
            <button
              className="btn btn-xs btn-ghost"
              onClick={() => toggle(c.id, { disabled: !c.disabled })}
            >
              {c.disabled ? "Enable" : "Disable"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

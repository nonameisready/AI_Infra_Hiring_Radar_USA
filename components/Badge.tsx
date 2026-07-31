const TONES = {
  neutral: "border-[#2a3040] text-[#98a1b5] bg-[#161a22]",
  ai: "border-emerald-500/40 text-emerald-300 bg-emerald-500/10",
  fde: "border-violet-500/40 text-violet-300 bg-violet-500/10",
  warn: "border-amber-500/40 text-amber-300 bg-amber-500/10",
  danger: "border-rose-500/40 text-rose-300 bg-rose-500/10",
  info: "border-sky-500/40 text-sky-300 bg-sky-500/10",
} as const;

export type Tone = keyof typeof TONES;

export function Badge({
  children,
  tone = "neutral",
  title,
}: {
  children: React.ReactNode;
  tone?: Tone;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] leading-4 ${TONES[tone]}`}
    >
      {children}
    </span>
  );
}

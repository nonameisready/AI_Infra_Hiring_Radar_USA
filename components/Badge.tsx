export function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-zinc-700 px-2 py-0.5 text-xs text-zinc-200">
      {children}
    </span>
  );
}

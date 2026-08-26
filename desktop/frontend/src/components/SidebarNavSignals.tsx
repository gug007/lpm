// Agents that stopped for you, and whether any of them errored — the two things
// the footer surfaces without being opened.
export function SidebarNavSignals({ needsYou, hasError }: { needsYou: number; hasError: boolean }) {
  if (needsYou <= 0 && !hasError) return null;
  return (
    <span className="flex items-center gap-1.5">
      {needsYou > 0 && (
        <span className="flex items-center gap-1 text-[10px] font-medium tabular-nums text-[var(--accent-amber)]">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent-amber)]" />
          {needsYou}
        </span>
      )}
      {hasError && <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent-red)]" />}
    </span>
  );
}

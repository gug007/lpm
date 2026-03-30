interface StatusBarProps {
  total: number;
  running: number;
}

export function StatusBar({ total, running }: StatusBarProps) {
  return (
    <footer className="flex items-center justify-between border-t border-[var(--border)] bg-[var(--bg-secondary)] px-4 py-2 text-xs text-[var(--text-muted)]">
      <span>
        {total} project{total !== 1 ? "s" : ""} &middot; {running} running
      </span>
      <span>lpm</span>
    </footer>
  );
}

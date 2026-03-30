export function StatusDot({ running }: { running: boolean }) {
  return (
    <span
      className={`inline-block h-2 w-2 shrink-0 rounded-full ${
        running ? "bg-[var(--accent-green)]" : "border border-[var(--text-muted)] bg-[var(--bg-primary)]"
      }`}
    />
  );
}

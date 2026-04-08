export function ProgressBar({ value }: { value: number }) {
  return (
    <div className="flex w-40 flex-col items-center gap-1.5">
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--bg-hover)]">
        <div
          className="h-full rounded-full bg-[var(--accent-green)] transition-[width] duration-200"
          style={{ width: `${value}%` }}
        />
      </div>
      <p className="text-[11px] text-[var(--text-muted)]">{value}%</p>
    </div>
  );
}

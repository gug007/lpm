import { Laptop } from "lucide-react";

// One computer a sync keeps the same: its name and its folder, the other one
// marked out.
export function IgnoredSyncEnd({
  label,
  name,
  path,
  remote,
  target,
}: {
  label: string;
  name: string;
  path: string;
  remote: boolean;
  target: boolean;
}) {
  return (
    <div
      className={`flex min-w-0 flex-1 items-center gap-2.5 rounded-xl border px-3 py-2.5 ${
        target
          ? "border-[var(--accent-cyan)]/40 bg-[var(--accent-cyan)]/5"
          : "border-[var(--border)] bg-[var(--bg-secondary)]"
      }`}
    >
      <Laptop size={17} className={target ? "shrink-0 text-[var(--accent-cyan-text)]" : "shrink-0 text-[var(--text-secondary)]"} />
      <div className="min-w-0">
        <div className="text-[11px] text-[var(--text-muted)]">{label}</div>
        <div className="flex items-center gap-1.5 text-[13px] font-semibold text-[var(--text-primary)]">
          {name}
          {remote && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent-green)]" />}
        </div>
        <div className="truncate font-mono text-[11px] text-[var(--text-muted)]" title={path}>
          {path}
        </div>
      </div>
    </div>
  );
}

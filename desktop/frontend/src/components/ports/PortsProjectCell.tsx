import { isOutside, type ListeningPort } from "./portsModel";

interface PortsProjectCellProps {
  port: ListeningPort;
  onSelectProject: () => void;
}

export function PortsProjectCell({ port: p, onSelectProject }: PortsProjectCellProps) {
  if (p.own) return <span className="truncate text-[var(--text-muted)]">lpm itself</span>;
  if (isOutside(p)) {
    return (
      <span className="flex min-w-0 items-center gap-2">
        <span className="shrink-0 rounded-full bg-[var(--accent-amber)]/15 px-2 py-px text-[10px] font-medium text-[var(--accent-amber-text)]">
          Outside lpm
        </span>
        {p.pid > 0 && <span className="truncate text-[11px] text-[var(--text-muted)]">PID {p.pid}</span>}
      </span>
    );
  }
  const label = p.projectLabel || p.project;
  return (
    <span className="flex min-w-0 items-center gap-2">
      <button
        onClick={onSelectProject}
        className="truncate text-left text-[var(--text-primary)] hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-blue)]"
        title={`Show ${label}`}
      >
        {label}
      </button>
      {p.parent && (
        <span className="shrink-0 rounded-full border border-[var(--border)] px-1.5 py-px text-[10px] text-[var(--text-muted)]">
          copy
        </span>
      )}
    </span>
  );
}

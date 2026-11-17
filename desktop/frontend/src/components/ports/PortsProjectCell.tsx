import { portProtocol } from "../../portProtocols";
import { isOutside, type ListeningPort } from "./portsModel";
import { StatusChip } from "../ui/StatusChip";
import { systemHolder } from "./systemHolders";

interface PortsProjectCellProps {
  port: ListeningPort;
  onSelectProject: () => void;
}

// Who the port belongs to: one of your projects, lpm itself, or something
// outside lpm — named when it's a system service or a known server.
export function PortsProjectCell({ port: p, onSelectProject }: PortsProjectCellProps) {
  if (p.own) return <span className="truncate text-[var(--text-secondary)]">lpm itself</span>;
  if (isOutside(p)) {
    const known = systemHolder(p)?.label ?? portProtocol(p.port, p.process)?.name;
    return (
      <span className="flex min-w-0 items-center gap-2" title={p.pid > 0 ? `PID ${p.pid}` : undefined}>
        {known && <span className="truncate text-[var(--text-secondary)]">{known}</span>}
        <StatusChip>Outside lpm</StatusChip>
      </span>
    );
  }
  const label = p.projectLabel || p.project;
  return (
    <span className="flex min-w-0 items-center gap-2">
      <button
        onClick={onSelectProject}
        className="truncate rounded-sm text-left font-medium text-[var(--text-primary)] underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-blue)]"
        title={`Show ${label}`}
      >
        {label}
      </button>
      {p.parent && <StatusChip>Copy</StatusChip>}
    </span>
  );
}

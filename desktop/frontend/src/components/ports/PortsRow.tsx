import { MACHINE } from "../../machineWords";
import { holderName, isOutside, LOCAL_MACHINE, uptimeLabel, type ListeningPort } from "./portsModel";
import { PortsProjectCell } from "./PortsProjectCell";
import { PORT_ACTION, PORT_DANGER, PORTS_GRID } from "./portsStyles";

interface PortsRowProps {
  port: ListeningPort;
  nowMs: number;
  onOpen: () => void;
  onCopy: () => void;
  onStop: () => void;
  onKill: () => void;
  onSelectProject: () => void;
}

function dotClass(p: ListeningPort): string {
  if (p.own) return "border border-[var(--text-muted)]";
  if (isOutside(p)) return "bg-[var(--accent-amber)]";
  if (!p.service) return "bg-[var(--accent-cyan)]";
  return "bg-[var(--accent-green)]";
}

export function PortsRow({ port: p, nowMs, onOpen, onCopy, onStop, onKill, onSelectProject }: PortsRowProps) {
  const canStop = !!p.project && !!p.service;
  const canKill = !p.own && !canStop && p.pid > 0;
  const machine = p.machine === LOCAL_MACHINE ? MACHINE.ThisMachineTitle : p.machineName;

  return (
    <div
      className={`${PORTS_GRID} border-t border-[var(--border)] px-4 py-2 text-xs first:border-t-0 ${
        isOutside(p) ? "bg-[var(--accent-amber)]/[0.04]" : ""
      }`}
    >
      <span className="font-mono text-sm font-semibold tabular-nums text-[var(--text-primary)]">{p.port}</span>
      <span className="flex min-w-0 items-center gap-2" title={p.process ? `${p.process} · PID ${p.pid}` : undefined}>
        <span className={`h-2 w-2 shrink-0 rounded-full ${dotClass(p)}`} />
        <span className="truncate text-[var(--text-primary)]">{holderName(p)}</span>
      </span>
      <PortsProjectCell port={p} onSelectProject={onSelectProject} />
      <span className="truncate text-[var(--text-muted)]">{machine}</span>
      <span className="font-mono tabular-nums text-[var(--text-muted)]">{uptimeLabel(p.startedAt, nowMs)}</span>
      <span className="flex items-center justify-end gap-1.5">
        {!p.own && (
          <>
            <button onClick={onOpen} className={PORT_ACTION}>
              Open
            </button>
            <button onClick={onCopy} className={PORT_ACTION}>
              Copy URL
            </button>
          </>
        )}
        {canStop && (
          <button onClick={onStop} className={PORT_ACTION} title={`Stop ${p.service} in ${p.projectLabel || p.project}`}>
            Stop
          </button>
        )}
        {canKill && (
          <button onClick={onKill} className={PORT_DANGER} title={`End ${p.process || "the process"} (PID ${p.pid})`}>
            Kill
          </button>
        )}
      </span>
    </div>
  );
}

import { MACHINE } from "../../machineWords";
import { portProtocol, protocolUrl } from "../../portProtocols";
import { CopyIcon } from "../icons";
import { holderName, isOutside, LOCAL_MACHINE, uptimeLabel, type ListeningPort } from "./portsModel";
import { PortsKillMenu } from "./PortsKillMenu";
import { PortsProjectCell } from "./PortsProjectCell";
import { PORT_ACTION, PORT_DANGER, PORTS_GRID } from "./portsStyles";
import { systemHolder } from "./systemHolders";

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
  if (systemHolder(p)) return "bg-[var(--text-muted)]";
  if (isOutside(p)) return "bg-[var(--accent-amber)]";
  if (!p.service) return "bg-[var(--accent-cyan)]";
  return "bg-[var(--accent-green)]";
}

export function PortsRow({ port: p, nowMs, onOpen, onCopy, onStop, onKill, onSelectProject }: PortsRowProps) {
  const canStop = !!p.project && !!p.service;
  const canKill = !p.own && !canStop && p.pid > 0;
  const machine = p.machine === LOCAL_MACHINE ? MACHINE.ThisMachineTitle : p.machineName;
  const system = systemHolder(p);
  const protocol = portProtocol(p.port, p.process);
  const holder = holderName(p);
  const fix = system?.fix?.(p.port);

  return (
    <div className={`border-t border-[var(--border)] first:border-t-0 ${isOutside(p) ? "bg-[var(--accent-amber)]/[0.04]" : ""}`}>
      <div className={`${PORTS_GRID} px-4 py-2 text-xs`}>
        <span className="font-mono text-sm font-semibold tabular-nums text-[var(--text-primary)]">{p.port}</span>
        <span className="flex min-w-0 items-center gap-2" title={p.process ? `${p.process} · PID ${p.pid}` : undefined}>
          <span className={`h-2 w-2 shrink-0 rounded-full ${dotClass(p)}`} />
          <span className="truncate text-[var(--text-primary)]">{holder}</span>
        </span>
        <PortsProjectCell port={p} onSelectProject={onSelectProject} />
        <span className="truncate text-[var(--text-muted)]">{machine}</span>
        <span className="font-mono tabular-nums text-[var(--text-muted)]">{uptimeLabel(p.startedAt, nowMs)}</span>
        <span className="flex items-center justify-end gap-1.5">
          {!p.own && !system && !protocol && (
            <>
              <button onClick={onOpen} className={PORT_ACTION}>
                Open
              </button>
              <button onClick={onCopy} className={PORT_ACTION}>
                Copy URL
              </button>
            </>
          )}
          {!p.own && !system && protocol && (
            <button
              onClick={onCopy}
              className={`${PORT_ACTION} flex items-center gap-1 font-mono [&>svg]:h-3 [&>svg]:w-3`}
              title={`Copy ${protocolUrl(protocol, p.port)}`}
            >
              <CopyIcon />
              {`${protocol.scheme}://…:${p.port}`}
            </button>
          )}
          {canStop && (
            <button onClick={onStop} className={PORT_ACTION} title={`Stop ${p.service} in ${p.projectLabel || p.project}`}>
              Stop
            </button>
          )}
          {canKill &&
            (system || protocol ? (
              <PortsKillMenu holder={holder} onKill={onKill} />
            ) : (
              <button onClick={onKill} className={PORT_DANGER} title={`End ${p.process || "the process"} (PID ${p.pid})`}>
                Kill
              </button>
            ))}
        </span>
      </div>
      {fix && <p className="px-4 pb-2 text-[11px] text-[var(--text-muted)]">{fix}</p>}
    </div>
  );
}

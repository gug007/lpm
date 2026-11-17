import { Info } from "lucide-react";
import { MACHINE } from "../../machineWords";
import { portProtocol, protocolUrl } from "../../portProtocols";
import { CopyIcon } from "../icons";
import { holderName, LOCAL_MACHINE, uptimeLabel, type ListeningPort } from "./portsModel";
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

export function PortsRow({ port: p, nowMs, onOpen, onCopy, onStop, onKill, onSelectProject }: PortsRowProps) {
  const canStop = !!p.project && !!p.service;
  const canKill = !p.own && !canStop && p.pid > 0;
  const machine = p.machine === LOCAL_MACHINE ? MACHINE.ThisMachineTitle : p.machineName;
  const system = systemHolder(p);
  const protocol = portProtocol(p.port, p.process);
  const holder = holderName(p);
  const fix = system?.fix?.(p.port);

  return (
    <div className="border-t border-[var(--border)] first:border-t-0">
      <div className={`${PORTS_GRID} px-4 py-2.5 text-[13px]`}>
        <span className="font-mono text-[13px] font-semibold tabular-nums text-[var(--text-primary)]">{p.port}</span>
        <span className="truncate text-[var(--text-primary)]" title={p.process ? `${p.process} · PID ${p.pid}` : undefined}>
          {holder}
        </span>
        <PortsProjectCell port={p} onSelectProject={onSelectProject} />
        <span className="truncate text-[var(--text-secondary)]">{machine}</span>
        <span className="tabular-nums text-[var(--text-secondary)]">{uptimeLabel(p.startedAt, nowMs)}</span>
        <span className="flex items-center justify-end gap-1.5">
          <span className="flex w-[54px] justify-end">
            {!p.own && !system && !protocol && (
              <button onClick={onOpen} className={PORT_ACTION} title={`Open localhost:${p.port} in the browser`}>
                Open
              </button>
            )}
          </span>
          <span className="flex w-[100px] justify-end">
            {!p.own && (
              <button
                onClick={onCopy}
                className={PORT_ACTION}
                title={protocol ? `Copy ${protocolUrl(protocol, p.port)}` : `Copy http://localhost:${p.port}`}
              >
                <CopyIcon />
                Copy URL
              </button>
            )}
          </span>
          <span className="flex w-[52px] justify-end">
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
        </span>
      </div>
      {fix && (
        <div className={`${PORTS_GRID} -mt-1 px-4 pb-2.5`}>
          <p className="col-span-5 col-start-2 flex items-start gap-1.5 text-[12px] leading-snug text-[var(--text-secondary)]">
            <Info size={13} className="mt-px shrink-0 text-[var(--text-muted)]" />
            {fix}
          </p>
        </div>
      )}
    </div>
  );
}

import { useEffect, useState } from "react";
import { ChevronDown, Coffee, Hash, ShieldCheck } from "lucide-react";
import { Toggle } from "../connections/Toggle";
import { WayInRow } from "./WayInRow";
import { keepAwakeText, type KeepAwakeStatus } from "../../mobile/reachStatus";
import { MACHINE } from "../../machineWords";

/** Settings people set once — the port and keeping this machine awake — and the
 *  security code lpm Link asks to compare, folded under one line so the card
 *  leads with what changes day to day. */
export function ReachOptions({
  port,
  onPort,
  keepAwake,
  keepAwakeStatus,
  onKeepAwake,
  identityCode,
}: {
  port: number;
  onPort: (port: number) => void;
  keepAwake: boolean;
  keepAwakeStatus: KeepAwakeStatus;
  onKeepAwake: (on: boolean) => void;
  identityCode: string;
}) {
  const [draft, setDraft] = useState(String(port));
  useEffect(() => setDraft(String(port)), [port]);
  const supported = keepAwakeStatus !== "unsupported";
  const awake = keepAwakeStatus === "awake";

  const commit = () => {
    const next = Number(draft);
    if (Number.isInteger(next) && next >= 1024 && next <= 65535 && next !== port) onPort(next);
    else setDraft(String(port));
  };

  return (
    <details className="group" data-settings-row="mobile.keepAwake">
      <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-2.5 text-[11px] text-[var(--text-muted)] transition-colors hover:text-[var(--text-secondary)] [&::-webkit-details-marker]:hidden">
        <span className="flex-1">
          Port {port}
          {supported && ` · keep awake ${keepAwake ? "on" : "off"}`}
          {identityCode && " · security code"}
        </span>
        <ChevronDown size={14} className="transition-transform group-open:rotate-180" />
      </summary>
      <div className="divide-y divide-[var(--border)] border-t border-[var(--border)]">
        <WayInRow
          icon={<Hash size={16} />}
          title="Port"
          subtitle={`Change it only if another app already uses ${port}.`}
        >
          <input
            type="number"
            aria-label="Port"
            value={draft}
            min={1024}
            max={65535}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
            className="w-20 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-2 py-1 text-sm tabular-nums text-[var(--text-primary)] outline-none focus:border-[var(--accent-cyan)]"
          />
        </WayInRow>
        <WayInRow
          icon={<Coffee size={16} />}
          title={`Keep ${MACHINE.thisMachine} awake`}
          subtitle={keepAwakeText(keepAwakeStatus, MACHINE.thisMachine)}
          tone={awake ? "live" : keepAwakeStatus === "failed" ? "problem" : "idle"}
        >
          {supported && (
            <Toggle enabled={keepAwake} onChange={onKeepAwake} ariaLabel={`Keep ${MACHINE.thisMachine} awake`} />
          )}
        </WayInRow>
        {identityCode && (
          <WayInRow
            icon={<ShieldCheck size={16} />}
            title="Security code"
            subtitle={`lpm Link shows this code if ${MACHINE.thisMachine}'s identity changes. Compare them before trusting it.`}
          >
            <span className="font-mono text-xs font-semibold tracking-wide text-[var(--text-primary)]">
              {identityCode}
            </span>
          </WayInRow>
        )}
      </div>
    </details>
  );
}

import { useEffect, useState } from "react";
import { ChevronDown, Coffee, Hash, ShieldCheck, Smartphone } from "lucide-react";
import { Toggle } from "../connections/Toggle";
import { WayInRow } from "./WayInRow";
import { keepAwakeText, type KeepAwakeStatus } from "../../mobile/reachStatus";
import { useMachineWords } from "../settings/useMachineWords";

/** Settings people set once — the port and keeping this machine awake — and the
 *  security code lpm Link asks to compare, folded under one line so the card
 *  leads with what changes day to day. Without `onKeepAwake` it is the port alone;
 *  `keepAwakeRow` lets settings search point at the keep-awake row itself. */
export function ReachOptions({
  port,
  onPort,
  keepAwake = false,
  keepAwakeStatus = "unsupported",
  onKeepAwake,
  openFromPhone = false,
  onOpenFromPhone,
  identityCode = "",
  settingsRow = "mobile.keepAwake",
  keepAwakeRow,
  open = false,
}: {
  port: number;
  onPort: (port: number) => void;
  keepAwake?: boolean;
  keepAwakeStatus?: KeepAwakeStatus;
  onKeepAwake?: (on: boolean) => void;
  openFromPhone?: boolean;
  /** Absent where lpm's login helper isn't offered (not a Mac, or a connected machine). */
  onOpenFromPhone?: (on: boolean) => void;
  identityCode?: string;
  settingsRow?: string;
  keepAwakeRow?: string;
  /** Unfolds it, as when the port needs changing; folding it again stays up to the user. */
  open?: boolean;
}) {
  const words = useMachineWords();
  const [draft, setDraft] = useState(String(port));
  useEffect(() => setDraft(String(port)), [port]);
  const supported = !!onKeepAwake && keepAwakeStatus !== "unsupported";
  const awake = keepAwakeStatus === "awake";

  const commit = () => {
    const next = Number(draft);
    if (Number.isInteger(next) && next >= 1024 && next <= 65535 && next !== port) onPort(next);
    else setDraft(String(port));
  };

  return (
    <details className="group" open={open || undefined} data-settings-row={settingsRow}>
      <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-2.5 text-[11px] text-[var(--text-muted)] transition-colors hover:text-[var(--text-secondary)] [&::-webkit-details-marker]:hidden">
        <span className="font-medium text-[var(--text-secondary)]">More options</span>
        <span className="min-w-0 flex-1 truncate text-right text-[var(--text-muted)]">
          Port {port}
          {supported && ` · ${keepAwake ? `${words.ThisMachine} stays awake` : `${words.ThisMachine} may sleep`}`}
          {identityCode && " · Security code"}
        </span>
        <ChevronDown size={14} className="shrink-0 text-[var(--text-muted)] transition-transform group-open:rotate-180" />
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
            className="w-20 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-2 py-1 text-sm tabular-nums text-[var(--text-primary)] outline-none focus:border-[var(--text-muted)]"
          />
        </WayInRow>
        {onKeepAwake && (
          <div data-settings-row={keepAwakeRow}>
            <WayInRow
              icon={<Coffee size={16} />}
              title={`Keep ${words.thisMachine} awake`}
              subtitle={keepAwakeText(keepAwakeStatus, words.thisMachine)}
              tone={awake ? "live" : keepAwakeStatus === "failed" ? "problem" : "idle"}
            >
              {supported && (
                <Toggle enabled={keepAwake} onChange={onKeepAwake} ariaLabel={`Keep ${words.thisMachine} awake`} />
              )}
            </WayInRow>
          </div>
        )}
        {onOpenFromPhone && (
          <WayInRow
            icon={<Smartphone size={16} />}
            title="Open lpm from your phone"
            subtitle={`When lpm is closed, lpm Link can start it again. A small helper starts with ${words.thisMachine} and answers only your paired devices, on the same network or over the Tailscale app.`}
            tone={openFromPhone ? "live" : "idle"}
          >
            <Toggle enabled={openFromPhone} onChange={onOpenFromPhone} ariaLabel="Open lpm from your phone" />
          </WayInRow>
        )}
        {identityCode && (
          <WayInRow
            icon={<ShieldCheck size={16} />}
            title="Security code"
            subtitle={`lpm Link shows this code if ${words.thisMachine}'s identity changes. Compare them before trusting it.`}
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

import { providerMeta } from "../../agentStatus";
import { useClaudeSwitches } from "../../store/claudeSwitches";
import { Spinner } from "../settings/Spinner";

/** Covers a Claude tab's terminal while its conversation moves to another
 *  account, so the stopped session and the new shell starting up underneath
 *  never show: only Claude, back on the account picked. */
export function ClaudeSwitchOverlay({ tabKey }: { tabKey: string }) {
  const accountLabel = useClaudeSwitches((s) => s.switches[tabKey]?.to);
  if (accountLabel === undefined) return null;
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-[var(--terminal-bg)]">
      <span className="flex items-center gap-2 text-[12px] text-[var(--text-secondary)]">
        <span className="flex" style={{ color: providerMeta("claude").color }}>
          <Spinner size={13} />
        </span>
        Continuing on {accountLabel}…
      </span>
    </div>
  );
}

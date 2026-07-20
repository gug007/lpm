import { useState } from "react";
import { useAgentLimits, pickProvider } from "../hooks/useAgentLimits";
import { useNow } from "../hooks/useNow";
import { useSettingsStore } from "../store/settings";
import { ApplyClaudeLimits } from "../../bridge/commands";
import { SidebarLimitRow } from "./SidebarLimitRow";
import { toast } from "sonner";

// Live usage meters for Claude Code and Codex in the sidebar footer. Codex needs
// no setup; Claude appears once the user turns on "Claude usage limits", which
// this row can also prompt for when it's off.
export function SidebarLimits({ onOpen }: { onOpen: () => void }) {
  const { limits: map } = useAgentLimits();
  const now = useNow(true, 30_000);
  const enabled = useSettingsStore((s) => s.claudeLimitsEnabled ?? false);
  const update = useSettingsStore((s) => s.update);
  const [enableHover, setEnableHover] = useState(false);
  const [enabling, setEnabling] = useState(false);

  const codex = pickProvider(map, "codex");
  const claude = pickProvider(map, "claude");

  const showEnable = !claude && !enabled;
  const showWaiting = !claude && enabled;
  if (!codex && !claude && !showEnable && !showWaiting) return null;

  const enable = async () => {
    setEnabling(true);
    void update({ claudeLimitsEnabled: true });
    try {
      await ApplyClaudeLimits(true);
    } catch (err) {
      void update({ claudeLimitsEnabled: false });
      toast.error(String(err));
    } finally {
      setEnabling(false);
    }
  };

  return (
    <div className="flex flex-col gap-0.5 border-t border-[var(--border)] px-2 py-1.5">
      {claude && <SidebarLimitRow data={claude} now={now} onClick={onOpen} />}
      {showWaiting && (
        <div
          role="button"
          onClick={onOpen}
          className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-1.5 hover:bg-[var(--bg-hover)]"
        >
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--text-muted)] opacity-50" />
          <span className="w-[42px] shrink-0 text-[11px] text-[var(--text-muted)]">
            Claude
          </span>
          <span className="min-w-0 flex-1 truncate text-[11px] text-[var(--text-muted)]">
            Waiting for a Claude session…
          </span>
        </div>
      )}
      {showEnable && (
        <div
          className="relative"
          onMouseEnter={() => setEnableHover(true)}
          onMouseLeave={() => setEnableHover(false)}
        >
          <button
            onClick={enable}
            disabled={enabling}
            className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left hover:bg-[var(--bg-hover)] disabled:opacity-50"
          >
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--text-muted)]" />
            <span className="w-[42px] shrink-0 text-[11px] text-[var(--text-muted)]">
              Claude
            </span>
            <span className="min-w-0 flex-1 truncate text-[11px] text-[var(--text-muted)]">
              {enabling ? "Turning on…" : "Show usage"}
            </span>
            <span className="shrink-0 text-[11px] font-medium text-[var(--accent-cyan)]">
              Enable
            </span>
          </button>
          {enableHover && !enabling && (
            <div className="absolute bottom-full left-2 right-2 z-50 mb-1 flex flex-col gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2.5 shadow-xl">
              <span className="text-xs font-medium text-[var(--text-primary)]">
                Claude usage meters
              </span>
              <span className="text-[11px] leading-relaxed text-[var(--text-secondary)]">
                Turn this on to see how much of your Claude plan you've used, right
                next to Codex. Your existing setup stays exactly as it is.
              </span>
            </div>
          )}
        </div>
      )}
      {codex && <SidebarLimitRow data={codex} now={now} onClick={onOpen} />}
    </div>
  );
}

import { Repeat } from "lucide-react";
import type { CiFixLoop } from "../types";
import { Switch } from "./ui/Switch";

/** A running Keep fixing until green loop in the checks menu, in place of its
 *  Fix with … rows: the round, where it stands, and a way to stop it. */
export function CiFixLoopStatus({ loop, onStop }: { loop: CiFixLoop; onStop: () => void }) {
  const percent = Math.round(Math.min(1, Math.max(0, loop.progress)) * 100);
  return (
    <div className="px-3 py-1.5 text-[11px]">
      <div className="flex items-center gap-2 text-[var(--text-secondary)]">
        <Repeat size={12} className="shrink-0 text-[var(--text-muted)]" />
        <span className="min-w-0 flex-1 truncate">Keep fixing until green</span>
        <Switch checked />
      </div>
      <div className="mt-2 flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <div className="font-medium text-[var(--text-primary)]">
            Round {loop.round} of {loop.maxRounds}
          </div>
          <div className="truncate text-[10px] text-[var(--text-muted)]" title={loop.detail}>
            {loop.detail}
          </div>
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            className="mt-1.5 h-1 overflow-hidden rounded-full bg-[var(--bg-hover)]"
          >
            <div className="h-full rounded-full bg-[var(--accent-cyan)] transition-[width]" style={{ width: `${percent}%` }} />
          </div>
        </div>
        <button
          type="button"
          onClick={onStop}
          className="shrink-0 rounded-md border border-[var(--border)] px-2 py-0.5 text-[11px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
        >
          Stop
        </button>
      </div>
    </div>
  );
}

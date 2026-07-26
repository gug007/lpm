import { PauseCircle, RefreshCw } from "lucide-react";
import type { FollowState } from "../followApi";

interface SyncedChipProps {
  follow: FollowState;
  macName: string;
  selected: boolean;
  onOpen: () => void;
}

// The remote project's row carries this once a copy of it is synced here: one mark
// saying the copy exists, and the way into it. There is no second row, because
// there is only one project — this Mac just has a copy to run and test.
export function SyncedChip({ follow, macName, selected, onOpen }: SyncedChipProps) {
  const paused = Boolean(follow.paused);
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
      onPointerDown={(e) => e.stopPropagation()}
      title={title(follow, macName)}
      className={`absolute right-8 top-1/2 flex -translate-y-1/2 items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide transition-colors ${
        paused
          ? "bg-[var(--accent-amber)]/12 text-[var(--accent-amber)] hover:bg-[var(--accent-amber)]/20"
          : selected
            ? "bg-[var(--accent-cyan)]/15 text-[var(--accent-cyan)]"
            : "bg-[var(--bg-active)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
      }`}
    >
      <span className={follow.syncing ? "animate-spin" : ""}>
        {paused ? <PauseCircle size={10} /> : <RefreshCw size={10} />}
      </span>
      synced
    </button>
  );
}

function title(follow: FollowState, macName: string): string {
  const open = "click to open the copy on this Mac";
  if (follow.paused) return `Sync paused — ${follow.paused}. ${open}`;
  if (follow.syncing) return `Syncing from ${macName} now. ${open}`;
  if (follow.lastError) return `${follow.lastError}. ${open}`;
  return `Synced from ${macName}. ${open}`;
}

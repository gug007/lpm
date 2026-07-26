import { PauseCircle, RefreshCw } from "lucide-react";
import type { FollowState } from "../followApi";

interface SyncedChipProps {
  follow: FollowState;
  macName: string;
  selected: boolean;
  /// Where the copy is, for a row that leads somewhere else. Omitted on a row that
  /// already opens the copy.
  onOpen?: () => void;
}

const CHIP_CLASS =
  "absolute right-8 top-1/2 flex -translate-y-1/2 items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide transition-colors";

// The mark a project carries once a copy of it is synced to this Mac: one word
// saying the copy exists, and the way into it. There is no second row, because
// there is only one project — this Mac just has a copy to run and test.
export function SyncedChip({ follow, macName, selected, onOpen }: SyncedChipProps) {
  const paused = Boolean(follow.paused);
  const tone = paused
    ? "bg-[var(--accent-amber)]/12 text-[var(--accent-amber)]"
    : selected
      ? "bg-[var(--accent-cyan)]/15 text-[var(--accent-cyan)]"
      : "bg-[var(--bg-active)] text-[var(--text-muted)]";
  const face = (
    <>
      <span className={follow.syncing ? "animate-spin" : ""}>
        {paused ? <PauseCircle size={10} /> : <RefreshCw size={10} />}
      </span>
      synced
    </>
  );

  if (!onOpen) {
    return (
      <span className={`${CHIP_CLASS} ${tone} pointer-events-none`} title={title(follow, macName)}>
        {face}
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
      onPointerDown={(e) => e.stopPropagation()}
      title={`${title(follow, macName)}. Click to open the copy on this Mac`}
      className={`${CHIP_CLASS} ${tone} ${
        paused ? "hover:bg-[var(--accent-amber)]/20" : selected ? "" : "hover:text-[var(--text-primary)]"
      }`}
    >
      {face}
    </button>
  );
}

function title(follow: FollowState, macName: string): string {
  if (follow.paused) return `Sync paused — ${follow.paused}`;
  if (follow.syncing) return `Syncing from ${macName} now`;
  if (follow.lastError) return follow.lastError;
  return `Synced from ${macName}`;
}

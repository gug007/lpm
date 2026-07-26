import { PauseCircle, RefreshCw } from "lucide-react";
import { isFirstSync, type FollowState } from "../followApi";

// The shape a synced copy is marked with, everywhere it appears: the same refresh
// loop the bar above a synced project uses, quiet enough to sit at the edge of a
// sidebar row. It turns while an update runs, becomes a pause when the copy has
// stopped following, and goes amber only when an update failed — a pause the user
// asked for is not a fault, so it stays as muted as every other row.
export function SyncGlyph({ follow, size = 13 }: { follow: FollowState; size?: number }) {
  const paused = Boolean(follow.paused);
  const stuck = !paused && Boolean(follow.lastError);
  const busy = follow.syncing || isFirstSync(follow);
  const Icon = paused ? PauseCircle : RefreshCw;

  return (
    <span
      className={`flex shrink-0 items-center ${
        stuck ? "text-[var(--accent-amber)]" : "text-[var(--text-muted)]"
      } ${busy ? "animate-spin [animation-duration:1.6s]" : ""}`}
    >
      <Icon size={size} strokeWidth={1.75} aria-hidden="true" />
    </span>
  );
}

import { PauseCircle, RefreshCw } from "lucide-react";
import type { FollowState } from "../followApi";

// The mark a project's sidebar row carries once a copy of it is synced to this Mac.
// Deliberately just the icon: the row's name is what the eye is looking for, and a
// worded badge takes enough width to truncate it. The tooltip carries the detail,
// and amber is kept for the states that want the user — stopped, or stuck retrying.
export function FollowIndicator({
  follow,
  macName,
  onOpen,
}: {
  follow: FollowState;
  macName: string;
  /// Opens the copy, for a row that leads somewhere else. Omitted on the copy's own
  /// row, where the mark is only a label.
  onOpen?: () => void;
}) {
  const stuck = Boolean(follow.paused) || Boolean(follow.lastError);
  const tone = stuck ? "text-[var(--accent-amber)]" : "text-[var(--text-muted)]";
  const icon = follow.paused ? (
    <PauseCircle size={12} />
  ) : (
    <span className={`block ${follow.syncing ? "animate-spin" : ""}`}>
      <RefreshCw size={12} />
    </span>
  );

  if (!onOpen) {
    return (
      <span className={`shrink-0 ${tone}`} title={followTitle(follow, macName)}>
        {icon}
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
      title={`${followTitle(follow, macName)} — click to open the copy on this Mac`}
      className={`shrink-0 rounded ${tone} transition-colors hover:text-[var(--text-primary)]`}
    >
      {icon}
    </button>
  );
}

function followTitle(follow: FollowState, macName: string): string {
  if (follow.paused) return `Sync paused — ${follow.paused}`;
  if (follow.syncing) return `Syncing from ${macName} now`;
  if (follow.lastError) return `Sync is retrying — ${follow.lastError}`;
  const base = `Synced from ${macName}`;
  if (!follow.lastSyncedAt) return base;
  return `${base} — last change ${sinceLabel(follow.lastSyncedAt)}`;
}

function sinceLabel(at: number): string {
  const seconds = Math.max(0, Math.round((Date.now() - at) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

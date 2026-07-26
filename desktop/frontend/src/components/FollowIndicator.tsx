import { PauseCircle, RefreshCw } from "lucide-react";
import type { FollowState } from "../followApi";

// The marker on a followed project's sidebar row. Amber only when the sync has
// stopped and needs the user — a paused follow is the one state they have to see.
export function FollowIndicator({ follow, macName }: { follow: FollowState; macName: string }) {
  if (follow.paused) {
    return (
      <span
        className="shrink-0 text-[var(--accent-amber)]"
        title={`Sync paused — ${follow.paused}`}
      >
        <PauseCircle size={12} />
      </span>
    );
  }
  return (
    <span
      className={`shrink-0 text-[var(--text-muted)] ${follow.syncing ? "animate-spin" : ""}`}
      title={followTitle(follow, macName)}
    >
      <RefreshCw size={12} />
    </span>
  );
}

function followTitle(follow: FollowState, macName: string): string {
  const base = `Following ${macName}`;
  if (follow.syncing) return `${base} — syncing now`;
  if (follow.lastError) return `${base} — ${follow.lastError}`;
  if (!follow.lastSyncedAt) return base;
  return `${base} — last synced ${sinceLabel(follow.lastSyncedAt)}`;
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

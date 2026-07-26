import { Play } from "lucide-react";
import { SyncGlyph } from "./SyncGlyph";
import { isFirstSync, type FollowState } from "../followApi";

// What the sync mark says when the pointer rests on it. Written for someone meeting
// synced copies for the first time: a headline for what is happening now, one plain
// sentence for what this folder even is, the thing it is actually for — running the
// other Mac's project here — and then the details, so the card teaches on the first
// hover and skims on every one after.
export function SyncTooltipCard({
  follow,
  macName,
  canOpen,
}: {
  follow: FollowState;
  macName: string;
  /// Whether clicking the mark opens the copy, which the card offers as its last line.
  canOpen: boolean;
}) {
  const { headline, body, meta } = summarize(follow, macName);

  return (
    <span className="flex w-[272px] flex-col gap-2">
      <span className="flex items-center gap-2">
        <SyncGlyph follow={follow} size={14} />
        <span className="text-[13px] font-medium text-[var(--text-primary)]">{headline}</span>
      </span>

      <span className="text-[12px] leading-[1.5] text-[var(--text-secondary)]">{body}</span>

      <span className="flex items-start gap-2 rounded-lg bg-[var(--bg-hover)] px-2.5 py-2 text-[12px] leading-[1.45] text-[var(--text-secondary)]">
        <Play size={11} strokeWidth={2} className="mt-[3px] shrink-0 text-[var(--accent-green)]" />
        <span>
          <span className="text-[var(--text-primary)]">Run it on this Mac.</span> Start its services
          and agents here, without touching {macName}.
        </span>
      </span>

      <span className="flex flex-col gap-1 border-t border-[var(--border)] pt-2 text-[11px] leading-[1.45] text-[var(--text-muted)]">
        <span>{meta}</span>
        {canOpen && <span className="text-[var(--text-secondary)]">Click to open this copy →</span>}
      </span>
    </span>
  );
}

function summarize(
  follow: FollowState,
  macName: string,
): { headline: string; body: string; meta: string } {
  const following = `The project itself lives on ${macName}. This copy follows along as files change over there.`;

  if (follow.paused) {
    return {
      headline: "Updates paused",
      body: `This copy has stopped following ${macName}, so it can fall behind. Open it to pick updates back up.`,
      meta: follow.paused,
    };
  }
  if (isFirstSync(follow)) {
    return {
      headline: "Setting up the copy",
      body: following,
      meta: `Bringing the project over from ${macName} — the first one takes the longest.`,
    };
  }
  if (follow.syncing) {
    return {
      headline: "Updating now",
      body: following,
      meta: `Picking up the latest changes from ${macName}.`,
    };
  }
  if (follow.lastError) {
    return {
      headline: "Trying again",
      body: `${following} The last update didn't finish, and lpm keeps retrying on its own.`,
      meta: follow.lastError,
    };
  }
  return {
    headline: "Up to date",
    body: following,
    meta: detailLine(follow),
  };
}

function detailLine(follow: FollowState): string {
  const parts = [`Updated ${sinceLabel(follow.lastSyncedAt)}`];
  if (follow.lastBranch) parts.push(follow.lastBranch);
  if (follow.files) parts.push(`${follow.files} files`);
  return parts.join(" · ");
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

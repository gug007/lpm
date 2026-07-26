import { Tooltip } from "./ui/Tooltip";
import { isFirstSync, type FollowState } from "../followApi";

const TOOLTIP_DELAY_MS = 350;

// The mark a project's sidebar row carries once a copy of it is synced to this Mac:
// a thin ring, sized to the row's text and quiet enough to ignore.
//
// Just the shape, no word — the row's name is what the eye is looking for, and a
// worded badge takes enough width to truncate it. The ring gains a moving arc while
// a sync runs, and turns amber only for the states that want the user; what it means
// is in the tooltip.
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
  const paused = Boolean(follow.paused);
  const stuck = paused || Boolean(follow.lastError);
  const busy = follow.syncing || isFirstSync(follow);
  const state = describe(follow, macName);
  const icon = (
    <svg
      width="11"
      height="11"
      viewBox="0 0 12 12"
      aria-hidden="true"
      className={`block ${stuck ? "text-[var(--accent-amber)]" : "text-[var(--text-muted)]"} ${
        busy ? "animate-spin" : ""
      }`}
    >
      <circle
        cx="6"
        cy="6"
        r="4.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.25"
        opacity={busy || stuck ? 0.4 : 0.3}
      />
      {paused ? (
        <circle cx="6" cy="6" r="1.5" fill="currentColor" />
      ) : (
        (busy || stuck) && (
          <path
            d="M6 1.5A4.5 4.5 0 0 1 10.5 6"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.25"
            strokeLinecap="round"
          />
        )
      )}
    </svg>
  );

  return (
    <Tooltip
      content={
        <span className="flex flex-col gap-0.5">
          <span>{state.headline}</span>
          <span className="text-[11px] text-[var(--text-muted)]">
            {onOpen ? `${state.detail} · click to open the copy here` : state.detail}
          </span>
        </span>
      }
      side="top"
      align="end"
      wide
      delay={TOOLTIP_DELAY_MS}
    >
      {onOpen ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpen();
          }}
          onPointerDown={(e) => e.stopPropagation()}
          aria-label={`${state.headline}. Open the copy on this Mac`}
          className="flex shrink-0 items-center rounded opacity-90 transition-opacity hover:opacity-100"
        >
          {icon}
        </button>
      ) : (
        <span className="flex shrink-0 items-center">{icon}</span>
      )}
    </Tooltip>
  );
}

function describe(follow: FollowState, macName: string): { headline: string; detail: string } {
  if (follow.paused) {
    return { headline: "Sync paused", detail: follow.paused };
  }
  if (isFirstSync(follow)) {
    return { headline: "First sync running", detail: `carrying the whole project from ${macName}` };
  }
  if (follow.syncing) {
    return { headline: "Syncing now", detail: `from ${macName}` };
  }
  if (follow.lastError) {
    return { headline: "Sync is retrying", detail: follow.lastError };
  }
  return {
    headline: `Mirror of ${macName}`,
    detail: `last change ${sinceLabel(follow.lastSyncedAt)}`,
  };
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

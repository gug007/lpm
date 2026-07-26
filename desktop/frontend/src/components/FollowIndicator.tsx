import { Tooltip } from "./ui/Tooltip";
import { SyncGlyph } from "./SyncGlyph";
import { SyncTooltipCard } from "./SyncTooltipCard";
import { isFirstSync, type FollowState } from "../followApi";

const TOOLTIP_DELAY_MS = 350;

// The mark a project's sidebar row carries once a copy of it is synced to this Mac.
//
// Just the shape, no word — the row's name is what the eye is looking for, and a
// worded badge takes enough width to truncate it. Everything the shape can't say is
// in the card that opens on hover.
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
  const icon = <SyncGlyph follow={follow} />;

  return (
    <Tooltip
      content={<SyncTooltipCard follow={follow} macName={macName} canOpen={Boolean(onOpen)} />}
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
          aria-label={`${ariaLabel(follow, macName)}. Open the copy on this Mac`}
          className="flex shrink-0 items-center rounded opacity-90 transition-opacity hover:opacity-100"
        >
          {icon}
        </button>
      ) : (
        <span className="flex shrink-0 items-center" aria-label={ariaLabel(follow, macName)}>
          {icon}
        </span>
      )}
    </Tooltip>
  );
}

function ariaLabel(follow: FollowState, macName: string): string {
  if (follow.paused) return `Updates paused for the copy of this project from ${macName}`;
  if (isFirstSync(follow)) return `Setting up the copy of this project from ${macName}`;
  if (follow.syncing) return `Updating the copy of this project from ${macName}`;
  if (follow.lastError) return `Retrying updates for the copy of this project from ${macName}`;
  return `Copy of this project from ${macName}, up to date`;
}

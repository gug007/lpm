import {
  STATUS_LINE_SEGMENT_ICONS,
  STATUS_LINE_SEGMENT_LABELS,
  statusLineColorValue,
} from "./statusLineEditorOptions";
import type { Segment } from "./statusLineTypes";

export function StatusLineSegmentContent({
  segment,
  showIcon,
}: {
  segment: Segment;
  showIcon: boolean;
}) {
  const label =
    segment.id === "text"
      ? segment.text || "Custom text"
      : STATUS_LINE_SEGMENT_LABELS[segment.id];
  const icon = segment.icon ?? STATUS_LINE_SEGMENT_ICONS[segment.id];

  return (
    <>
      {showIcon && icon && (
        <span
          aria-hidden
          className={segment.id === "model" ? "font-semibold" : undefined}
          style={{ color: statusLineColorValue(segment.color) }}
        >
          {icon}
        </span>
      )}
      <span className="max-w-[8rem] truncate font-medium">{label}</span>
      <span
        aria-hidden
        className="h-2 w-2 shrink-0 rounded-full"
        style={{
          background:
            segment.color === "default"
              ? "transparent"
              : statusLineColorValue(segment.color),
          border:
            segment.color === "default"
              ? "1px solid var(--text-muted)"
              : undefined,
        }}
      />
    </>
  );
}

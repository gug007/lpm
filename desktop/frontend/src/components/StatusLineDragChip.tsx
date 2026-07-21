import { GripVertical } from "lucide-react";
import { StatusLineSegmentContent } from "./StatusLineSegmentContent";
import type { Segment } from "./statusLineTypes";

export function StatusLineDragChip({
  segment,
  showIcon,
}: {
  segment: Segment;
  showIcon: boolean;
}) {
  return (
    <div className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--accent-green)] bg-[var(--bg-primary)] px-2 text-[11px] text-[var(--text-primary)] shadow-xl">
      <GripVertical size={12} className="text-[var(--text-muted)]" />
      <StatusLineSegmentContent segment={segment} showIcon={showIcon} />
    </div>
  );
}

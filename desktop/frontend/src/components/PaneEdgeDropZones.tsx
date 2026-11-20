import { memo, type CSSProperties } from "react";
import { useDroppable } from "@dnd-kit/core";
import { PANE_EDGES, type PaneEdge } from "../paneMoves";
import { edgeDropId } from "./tabDropIds";
import { useDragSourcePaneId } from "./TerminalTabDnd";

const SIDE = "28%";

const LABEL: Record<PaneEdge, string> = {
  left: "New pane left",
  right: "New pane right",
  bottom: "New pane below",
};

const PREVIEW: Record<PaneEdge, CSSProperties> = {
  left: { left: 4, top: 4, bottom: 4, width: "calc(50% - 6px)" },
  right: { right: 4, top: 4, bottom: 4, width: "calc(50% - 6px)" },
  bottom: { left: 4, right: 4, bottom: 4, height: "calc(50% - 6px)" },
};

const HINT: CSSProperties = {
  border: "1.5px dashed color-mix(in srgb, var(--accent-cyan) 45%, transparent)",
  borderRadius: 8,
};

function zoneStyle(edge: PaneEdge, allowLeft: boolean): CSSProperties {
  if (edge === "left") return { left: 4, top: 4, bottom: 4, width: SIDE };
  if (edge === "right") return { right: 4, top: 4, bottom: 4, width: SIDE };
  return { left: allowLeft ? `calc(${SIDE} + 10px)` : 10, right: `calc(${SIDE} + 10px)`, bottom: 4, height: "40%" };
}

// Drop targets on a pane's left, right and bottom edges while a tab is dragged:
// a drop there opens a new pane on that side holding the tab. The top edge is
// the tab strip, where a drop moves the tab into the pane instead.
// `canSplitOff` is whether one of this pane's own tabs may leave it for a new
// pane; when it can't, the zones stay hidden and a drop there changes nothing.
export const PaneEdgeDropZones = memo(function PaneEdgeDropZones({
  paneId,
  allowLeft,
  canSplitOff,
}: {
  paneId: string;
  allowLeft: boolean;
  canSplitOff: boolean;
}) {
  const source = useDragSourcePaneId();
  const zones = {
    left: useDroppable({ id: edgeDropId(paneId, "left"), disabled: !allowLeft }),
    right: useDroppable({ id: edgeDropId(paneId, "right") }),
    bottom: useDroppable({ id: edgeDropId(paneId, "bottom") }),
  };
  const shown = PANE_EDGES.filter((edge) => edge !== "left" || allowLeft);
  const hints = source !== null && (source !== paneId || canSplitOff);
  const over = hints ? (shown.find((edge) => zones[edge].isOver) ?? null) : null;

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-30">
      {shown.map((edge) => (
        <div
          key={edge}
          ref={zones[edge].setNodeRef}
          className="absolute"
          style={{ ...zoneStyle(edge, allowLeft), ...(hints && !over ? HINT : {}) }}
        />
      ))}
      {over && (
        <div
          className="absolute flex items-center justify-center rounded-lg border-2 border-[var(--accent-cyan)] text-[12px] font-medium text-[var(--text-primary)]"
          style={{ ...PREVIEW[over], background: "color-mix(in srgb, var(--accent-cyan) 16%, transparent)" }}
        >
          {LABEL[over]}
        </div>
      )}
    </div>
  );
});

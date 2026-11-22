import { useDroppable } from "@dnd-kit/core";
import { Plus } from "lucide-react";
import { Fragment, type ReactNode } from "react";
import { ROW_DETAIL_INFO, detailShows, detailText } from "../sidebarRowDetails";
import type { RowDetail, RowSide, SidebarRowLayout } from "../sidebarRowLayout";
import type { RowSample } from "./rowSample";
import { RowLayoutStageItem } from "./RowLayoutStageItem";
import { ROLLUP_SEPARATOR_CLASS } from "./sidebarRollup";
import { SidebarRowDetail } from "./SidebarRowDetail";

interface RowLayoutStageSideProps {
  id: string;
  line: number;
  side: RowSide;
  details: RowDetail[];
  // Where a drop would land on this side, or null when the drag is elsewhere.
  caretAt: number | null;
  dragging: boolean;
  picked: RowDetail | null;
  sample: RowSample;
  layout: SidebarRowLayout;
  onPick: (detail: RowDetail) => void;
  onHide: (detail: RowDetail) => void;
  onPutHere: () => void;
}

// The gaps the sidebar leaves between details: line 1's left side, any right
// side, and a lower line's left side, which runs as text with "·" between.
const GAP = { firstLeft: "gap-2", right: "gap-1.5", lowerLeft: "" } as const;
// The caret's margins give back its own width and the gap it adds, so showing
// it never moves a detail, nor the line under the pointer.
const CARET_MARGIN = { firstLeft: "-mx-[4.75px]", right: "-mx-[3.75px]", lowerLeft: "-mx-[0.75px]" } as const;

/** One side of one line on the Row builder's copy of the row. The left side
 *  reaches across to the right one, so a drop anywhere on the line lands. */
export function RowLayoutStageSide({
  id,
  line,
  side,
  details,
  caretAt,
  dragging,
  picked,
  sample,
  layout,
  onPick,
  onHide,
  onPutHere,
}: RowLayoutStageSideProps) {
  const { setNodeRef } = useDroppable({ id });
  const right = side === "right";
  const lowerLeft = !right && line > 0;
  const place = right ? "right" : lowerLeft ? "lowerLeft" : "firstLeft";
  const over = caretAt !== null;
  const canPut = picked !== null && !details.includes(picked);

  const caret = (
    <span
      key="caret"
      className={`w-[1.5px] shrink-0 rounded-sm bg-[var(--accent-cyan)] ${CARET_MARGIN[place]} ${
        line > 0 ? "h-[11px]" : "h-[14px]"
      }`}
    />
  );
  const items: ReactNode[] = details.map((detail, i) => (
    <Fragment key={detail}>
      {lowerLeft && i > 0 && <span className={ROLLUP_SEPARATOR_CLASS}>·</span>}
      <RowLayoutStageItem
        detail={detail}
        content={
          detailShows(detail, sample.data, sample.builtIns.flags, layout) ? (
            <SidebarRowDetail
              detail={detail}
              data={sample.data}
              layout={layout}
              builtIns={sample.builtIns.nodes}
              chip={right}
            />
          ) : null
        }
        value={detailText(detail, sample.data, sample.builtIns.flags, layout)}
        whole={right}
        picked={picked === detail}
        onPick={() => onPick(detail)}
        onHide={() => onHide(detail)}
      />
    </Fragment>
  ));
  if (over) items.splice(Math.min(caretAt, items.length), 0, caret);
  // At the side's inner edge: right after the name on the left, where a cut
  // never reaches it, and at the line's end on the right.
  const putButton = picked && (
    <button
      type="button"
      onClick={onPutHere}
      aria-label={`Put ${ROW_DETAIL_INFO[picked].label} here: line ${line + 1}, ${side} side`}
      title="Put it here"
      className="flex h-[13px] w-[13px] shrink-0 items-center justify-center rounded-full border border-[var(--accent-cyan)] bg-[var(--accent-cyan)]/15 text-[var(--accent-cyan-text)] outline-none hover:bg-[var(--accent-cyan)]/30 focus-visible:ring-1 focus-visible:ring-[var(--accent-cyan)]"
    >
      <Plus size={8} strokeWidth={3} />
    </button>
  );

  return (
    <span
      ref={setNodeRef}
      data-row-side={id}
      role="group"
      aria-label={`Line ${line + 1}, ${side} side`}
      // The left side gives way as the sidebar's does, cut across only, so the
      // × above a detail and the outline around the side still show.
      className={`flex items-center self-stretch ${
        right ? "ml-auto shrink-0 pl-1.5" : "-ml-[3px] min-w-0 flex-1 basis-0 overflow-x-clip pl-[3px]"
      }`}
    >
      <span
        className={`flex items-center rounded-[3px] outline-1 outline-offset-[1.5px] ${GAP[place]} ${
          details.length === 0 ? "min-w-[14px] justify-center" : "min-w-0"
        } ${
          over
            ? "bg-[var(--accent-cyan)]/10 outline-solid outline-[var(--accent-cyan)]"
            : dragging
              ? "outline-dashed outline-[var(--accent-cyan)]/50"
              : "outline-dashed outline-transparent group-hover/line:outline-[var(--text-primary)]/15"
        }`}
      >
        {canPut && !right && putButton}
        {items}
        {canPut && right && putButton}
        {!canPut && details.length === 0 && !over && (
          <Plus size={8} strokeWidth={3} aria-hidden="true" className="text-[var(--text-muted)] opacity-60" />
        )}
      </span>
    </span>
  );
}

import { ChevronDown, Plus, Trash2 } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";
import { zoneId, type ZoneItems } from "../rowLayoutDnd";
import { MAX_ROW_LINES, type RowDetail, type RowSide, type SidebarRowLayout } from "../sidebarRowLayout";
import { ProjectStatusLight } from "./ProjectStatusLight";
import type { RowSample } from "./rowSample";
import { RowLayoutStageSide } from "./RowLayoutStageSide";

export interface RowDrop {
  zone: string;
  index: number;
}

interface RowLayoutStageProps {
  items: ZoneItems;
  lineCount: number;
  sample: RowSample;
  layout: SidebarRowLayout;
  // A sidebar row's own width, before it's drawn bigger here.
  rowWidth: number;
  active: RowDetail | null;
  drop: RowDrop | null;
  picked: RowDetail | null;
  onPick: (detail: RowDetail) => void;
  onHide: (detail: RowDetail) => void;
  onPutHere: (zone: string, index: number) => void;
  onRemoveLine: (line: number) => void;
  onAddLine: () => void;
}

// The room the copy of the row has between the line numbers and the
// remove-line buttons; it's drawn twice the size when it fits.
const ROOM = 590;
const GUTTER = 44;
const SIDES: RowSide[] = ["left", "right"];

/** The Row builder's layout: the sample project's row, drawn as the sidebar
 *  draws it, bigger, with every side of every line a place to drop. */
export function RowLayoutStage({
  items,
  lineCount,
  sample,
  layout,
  rowWidth,
  active,
  drop,
  picked,
  onPick,
  onHide,
  onPutHere,
  onRemoveLine,
  onAddLine,
}: RowLayoutStageProps) {
  const zoom = Math.min(2, ROOM / rowWidth);
  const drawnWidth = Math.round(rowWidth * zoom);
  const multi = lineCount > 1;
  const stageRef = useRef<HTMLDivElement>(null);
  // Each line's middle, measured, so the numbers beside it line up however tall
  // its details draw it.
  const [marks, setMarks] = useState<number[]>([]);
  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const top = stage.getBoundingClientRect().top + stage.clientTop;
    const next = [...stage.querySelectorAll<HTMLElement>("[data-row-line]")].map((el) => {
      const r = el.getBoundingClientRect();
      return Math.round(r.top + r.height / 2 - top);
    });
    setMarks((prev) => (prev.join() === next.join() ? prev : next));
  });

  const sideOf = (line: number, side: RowSide) => {
    const id = zoneId(line, side);
    const details = items[id] ?? [];
    return (
      <RowLayoutStageSide
        key={side}
        id={id}
        line={line}
        side={side}
        details={details}
        caretAt={drop?.zone === id ? drop.index : null}
        dragging={active !== null}
        picked={picked}
        sample={sample}
        layout={layout}
        onPick={onPick}
        onHide={onHide}
        onPutHere={() => onPutHere(id, side === "left" ? 0 : details.length)}
      />
    );
  };

  return (
    <div
      ref={stageRef}
      className="relative rounded-xl border border-[var(--border)] bg-[var(--bg-sidebar)] pb-3 pt-3.5"
      style={{ paddingLeft: GUTTER, paddingRight: GUTTER }}
    >
      {marks.map((y, i) => (
        <span
          key={i}
          className="absolute left-3 flex h-5 w-5 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--bg-primary)] text-[10.5px] font-semibold tabular-nums text-[var(--text-muted)]"
          style={{ top: y - 10 }}
        >
          {i + 1}
        </span>
      ))}
      {marks.map(
        (y, i) =>
          i > 0 && (
            <button
              key={`rm${i}`}
              type="button"
              onClick={() => onRemoveLine(i)}
              aria-label={`Remove line ${i + 1}`}
              title={`Remove line ${i + 1}`}
              className="absolute flex h-6 w-6 items-center justify-center rounded-md text-[var(--text-muted)] outline-none hover:bg-[var(--bg-hover)] hover:text-[var(--accent-red)] focus-visible:ring-1 focus-visible:ring-[var(--accent-cyan)]"
              style={{ top: y - 12, left: GUTTER + drawnWidth + 8 }}
            >
              <Trash2 size={13} />
            </button>
          ),
      )}
      <div style={{ zoom, width: rowWidth }}>
        <div
          className={`flex w-full gap-3 rounded-md bg-[var(--bg-active)] px-3 text-sm text-[var(--text-primary)] ${
            multi ? "items-start py-1" : "items-center py-2"
          }`}
        >
          <span className="flex h-5 shrink-0 items-center">
            {sample.project ? (
              <ProjectStatusLight project={sample.project} />
            ) : (
              <span className="h-2 w-2 rounded-full border-[1.5px] border-[var(--text-muted)]" />
            )}
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            {Array.from({ length: lineCount }, (_, i) =>
              i === 0 ? (
                <span key={i} data-row-line className="group/line flex h-5 min-w-0 items-center gap-3">
                  <span className="min-w-0 truncate" title="The dot and the name always start the row">
                    {sample.name}
                  </span>
                  <span className="flex min-w-0 flex-1 items-center self-stretch text-[11px] text-[var(--text-muted)]">
                    {SIDES.map((side) => sideOf(0, side))}
                  </span>
                  {sample.builtIns.agents && (
                    <span
                      className="flex w-5 shrink-0 justify-end text-[var(--text-muted)] opacity-60"
                      title="The agent arrow always ends line 1"
                    >
                      <ChevronDown size={12} aria-hidden="true" />
                    </span>
                  )}
                </span>
              ) : (
                <span
                  key={i}
                  data-row-line
                  className="group/line mt-px flex min-w-0 items-center text-[10px] leading-[13px] text-[var(--text-muted)]"
                >
                  {SIDES.map((side) => sideOf(i, side))}
                </span>
              ),
            )}
          </span>
        </div>
      </div>
      <button
        type="button"
        onClick={onAddLine}
        disabled={lineCount >= MAX_ROW_LINES}
        className="mt-2.5 flex h-[30px] items-center justify-center gap-1.5 rounded-lg border border-dashed border-[var(--border)] text-[12px] font-medium text-[var(--text-muted)] outline-none hover:border-[var(--accent-cyan)] hover:bg-[var(--accent-cyan)]/8 hover:text-[var(--accent-cyan-text)] focus-visible:ring-1 focus-visible:ring-[var(--accent-cyan)] disabled:pointer-events-none disabled:opacity-60"
        style={{ width: drawnWidth }}
      >
        {lineCount >= MAX_ROW_LINES ? (
          `${MAX_ROW_LINES} lines is the most a row can have`
        ) : (
          <>
            <Plus size={12} strokeWidth={2.5} />
            Add a line
          </>
        )}
      </button>
    </div>
  );
}

import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { useEffect, useMemo, useRef, useState } from "react";
import { useDragBodyAttribute } from "../hooks/useDragBodyAttribute";
import {
  TRAY_ZONE,
  dropIndex,
  itemsFromLines,
  linesFromItems,
  placeAt,
  sameItems,
  type ZoneItems,
} from "../rowLayoutDnd";
import { ROW_DETAIL_INFO } from "../sidebarRowDetails";
import {
  addLine,
  placedDetails,
  removeLine,
  type RowDetail,
  type RowLine,
  type SidebarRowLayout,
} from "../sidebarRowLayout";
import type { RowSample } from "./rowSample";
import { RowLayoutChipGhost } from "./RowLayoutChipGhost";
import { RowLayoutStage, type RowDrop } from "./RowLayoutStage";
import { RowLayoutTray } from "./RowLayoutTray";

interface RowLayoutEditorProps {
  lines: RowLine[];
  onChange: (lines: RowLine[]) => void;
  sample: RowSample;
  layout: SidebarRowLayout;
  rowWidth: number;
  valueOf: (detail: RowDetail) => string | undefined;
}

const SECTION_LABEL = "text-[10.5px] font-semibold uppercase tracking-wider text-[var(--text-muted)]";
const HINT = "text-[11.5px] text-[var(--text-muted)]";

function pointerX(e: DragMoveEvent): number {
  return (e.activatorEvent as PointerEvent).clientX + e.delta.x;
}

/** The Row builder's layout and tray, with drag and drop between them. */
export function RowLayoutEditor({ lines, onChange, sample, layout, rowWidth, valueOf }: RowLayoutEditorProps) {
  const committed = useMemo(() => itemsFromLines(lines), [lines]);
  // A drop stays drawn until the saved layout comes back, so nothing jumps
  // back for the moment the save takes.
  const [held, setHeld] = useState<ZoneItems | null>(null);
  const [active, setActive] = useState<RowDetail | null>(null);
  const [drop, setDrop] = useState<RowDrop | null>(null);
  const dropRef = useRef<RowDrop | null>(null);
  const [picked, setPicked] = useState<RowDetail | null>(null);
  const justDropped = useRef(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const items = held ?? committed;
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  useDragBodyAttribute(active !== null);

  useEffect(() => setHeld(null), [committed]);

  const commit = (next: ZoneItems) => {
    if (sameItems(next, items)) return;
    setHeld(next);
    onChange(linesFromItems(next, lines.length));
  };

  const aimAt = (next: RowDrop | null) => {
    const cur = dropRef.current;
    if (cur?.zone === next?.zone && cur?.index === next?.index) return;
    dropRef.current = next;
    setDrop(next);
  };

  const endDrag = () => {
    setActive(null);
    aimAt(null);
  };

  const onDragStart = ({ active: a }: DragStartEvent) => {
    setPicked(null);
    setActive(String(a.id) as RowDetail);
  };

  // Where the detail would land: a side's details don't move aside while one
  // passes, so the place is read from where they're drawn. The zone comes from
  // this move's collisions; `over` still holds the one before.
  const onDragMove = (e: DragMoveEvent) => {
    const hit = e.collisions?.[0]?.id ?? null;
    const zone = hit === null ? null : String(hit);
    if (!zone) return aimAt(null);
    if (zone === TRAY_ZONE) return aimAt({ zone, index: 0 });
    const side = rootRef.current?.querySelector(`[data-row-side="${zone}"]`);
    const boxes = [...(side?.querySelectorAll<HTMLElement>("[data-row-item]") ?? [])]
      .filter((el) => el.dataset.rowItem !== String(e.active.id))
      .map((el) => el.getBoundingClientRect());
    aimAt({ zone, index: dropIndex(pointerX(e), boxes) });
  };

  const onDragEnd = ({ active: a }: DragEndEvent) => {
    const at = dropRef.current;
    // A drop that ends where it began still clicks the detail: that click isn't a pick.
    justDropped.current = true;
    setTimeout(() => {
      justDropped.current = false;
    }, 0);
    endDrag();
    if (at) commit(placeAt(items, String(a.id) as RowDetail, at.zone, at.index));
  };

  const pick = (detail: RowDetail) => {
    if (!justDropped.current) setPicked((p) => (p === detail ? null : detail));
  };
  const hide = (detail: RowDetail) => {
    commit(placeAt(items, detail, TRAY_ZONE, 0));
    if (picked === detail) setPicked(null);
  };
  const putHere = (zone: string, index: number) => {
    if (picked) commit(placeAt(items, picked, zone, index));
    setPicked(null);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={onDragStart}
      onDragMove={onDragMove}
      onDragOver={onDragMove}
      onDragEnd={onDragEnd}
      onDragCancel={endDrag}
    >
      <div ref={rootRef} className="contents">
        <section className="flex flex-col gap-2">
          <div className="flex items-baseline gap-2.5">
            <h3 className={SECTION_LABEL}>Layout</h3>
            <span className={HINT}>
              {picked
                ? `Press + where ${ROW_DETAIL_INFO[picked].label} should go`
                : "Hover a detail to move it or hide it"}
            </span>
          </div>
          <RowLayoutStage
            items={items}
            lineCount={lines.length}
            sample={sample}
            layout={layout}
            rowWidth={rowWidth}
            active={active}
            drop={drop?.zone === TRAY_ZONE ? null : drop}
            picked={picked}
            onPick={pick}
            onHide={hide}
            onPutHere={putHere}
            onRemoveLine={(line) => onChange(removeLine(lines, line))}
            onAddLine={() => onChange(addLine(lines))}
          />
        </section>
        <section className="flex flex-col gap-2">
          <div className="flex items-baseline gap-2.5">
            <h3 className={SECTION_LABEL}>Details</h3>
            <span className={HINT}>Not on the row yet. Drag one onto it.</span>
          </div>
          <RowLayoutTray
            details={items[TRAY_ZONE] ?? []}
            valueOf={valueOf}
            dragging={active !== null}
            over={drop?.zone === TRAY_ZONE}
            picked={picked}
            canHidePicked={picked !== null && placedDetails(lines).has(picked)}
            onPick={pick}
            onHidePicked={() => picked && hide(picked)}
          />
        </section>
      </div>
      <DragOverlay className="pointer-events-none" dropAnimation={null}>
        {active && <RowLayoutChipGhost detail={active} />}
      </DragOverlay>
    </DndContext>
  );
}

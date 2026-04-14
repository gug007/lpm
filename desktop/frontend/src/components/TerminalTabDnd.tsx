import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  rectIntersection,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { collectPanes, type PaneLeaf, type PaneNode } from "../paneTree";
import { HeaderTab } from "./terminal/HeaderTab";

// Tab strip drop targets use the pane id with this suffix so the drag
// handler can distinguish "dropped on a specific tab" from "dropped on
// the empty part of a tab strip" (needed for panes that have no tabs of
// their own, e.g. service-only panes).
const DROP_SUFFIX = ":tabstrip";
const tabStripDroppableId = (paneId: string) => `${paneId}${DROP_SUFFIX}`;
const isStripId = (id: string) => id.endsWith(DROP_SUFFIX);

// Tab droppables and strip droppables overlap: every tab's rect sits
// inside its strip's rect, so corner- and center-based collision
// strategies can pick the strip when the cursor is on a tab — especially
// at the very-left edge of the first tab where their corners coincide,
// sending the drop to the end of the list. Prefer the pointer-hit tab;
// fall back to rect intersection when the pointer isn't over anything
// (e.g. past the last tab in an empty strip area).
const tabPreferringCollision: CollisionDetection = (args) => {
  const pointerHits = pointerWithin(args);
  if (pointerHits.length > 0) {
    const tabHit = pointerHits.find((c) => !isStripId(String(c.id)));
    return tabHit ? [tabHit] : pointerHits;
  }
  return rectIntersection(args);
};

interface ActiveDrag {
  termId: string;
  label: string;
  fromPaneId: string;
}

// `useDroppable`'s `isOver` alone can't drive the drop indicator: tabs
// inside a pane intercept collisions, so the strip droppable never
// "wins" over a pane that already has tabs. TabStrips and SortableTabs
// read this context instead to render a precise insertion marker.
interface DndHoverState {
  activePaneId: string | null;
  overPaneId: string | null;
  overIndex: number | null;
}
const DndHoverContext = createContext<DndHoverState>({
  activePaneId: null,
  overPaneId: null,
  overIndex: null,
});

interface TerminalTabDndProps {
  tree: PaneNode | null;
  onReorder: (paneId: string, order: string[]) => void;
  onMove: (fromPaneId: string, termId: string, toPaneId: string, toIdx?: number) => void;
  children: ReactNode;
}

export function TerminalTabDnd({ tree, onReorder, onMove, children }: TerminalTabDndProps) {
  const [active, setActive] = useState<ActiveDrag | null>(null);
  const [overPaneId, setOverPaneId] = useState<string | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  // 5px activation distance matches the old SortableList — lets a quick
  // click on a tab pass through to its onClick handler.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const resetDrag = useCallback(() => {
    setActive(null);
    setOverPaneId(null);
    setOverIndex(null);
  }, []);

  // Single-pass index of every term id to its owning pane plus a plain
  // pane list. Both handlers need to look up the source tab (by active.id)
  // and the destination tab (by over.id); without the map, handleDragOver
  // does two `panes.find(...tabs.some(...))` walks per mousemove frame.
  const indexTree = (t: PaneNode) => {
    const panes = collectPanes(t);
    const byTermId = new Map<string, PaneLeaf>();
    for (const p of panes) for (const tab of p.tabs) byTermId.set(tab.id, p);
    return { panes, byTermId };
  };

  // Cross-pane drops compare pointer x (activator + delta) to the over
  // tab's midpoint so a drop on the right half inserts after — needed
  // to land at the end of the list, and more pixel-accurate than
  // dragged-rect centers when the source tab is wider than destination
  // tabs. Same-pane drops keep the "arrayMove to over's index" semantic
  // so visuals match SortableContext's slide animation during the drag.
  const resolveOverTarget = (
    e: DragOverEvent | DragEndEvent,
    panes: PaneLeaf[],
    byTermId: Map<string, PaneLeaf>,
    fromPaneId: string | null,
  ): { paneId: string; index: number } | null => {
    const { over, active } = e;
    if (!over) return null;
    const overId = String(over.id);
    if (isStripId(overId)) {
      const paneId = overId.slice(0, -DROP_SUFFIX.length);
      const pane = panes.find((p) => p.id === paneId);
      return pane ? { paneId, index: pane.tabs.length } : null;
    }
    const pane = byTermId.get(overId);
    if (!pane) return null;
    const idx = pane.tabs.findIndex((t) => t.id === overId);
    if (pane.id === fromPaneId) {
      return { paneId: pane.id, index: idx };
    }
    const overCenter = over.rect.left + over.rect.width / 2;
    const activator = e.activatorEvent;
    let pointerX: number | null = null;
    if (activator instanceof MouseEvent) {
      pointerX = activator.clientX + e.delta.x;
    } else {
      const activeRect = active.rect.current.translated;
      if (activeRect) pointerX = activeRect.left + activeRect.width / 2;
    }
    const insertAfter = pointerX !== null ? pointerX > overCenter : false;
    return { paneId: pane.id, index: insertAfter ? idx + 1 : idx };
  };

  const handleDragStart = (e: DragStartEvent) => {
    if (!tree) return;
    const id = String(e.active.id);
    const { byTermId } = indexTree(tree);
    const pane = byTermId.get(id);
    const tab = pane?.tabs.find((t) => t.id === id);
    if (tab && pane) setActive({ termId: id, label: tab.label, fromPaneId: pane.id });
  };

  const handleDragOver = (e: DragOverEvent) => {
    if (!tree) return;
    const { panes, byTermId } = indexTree(tree);
    const fromPane = byTermId.get(String(e.active.id)) ?? null;
    const target = resolveOverTarget(e, panes, byTermId, fromPane?.id ?? null);
    setOverPaneId(target?.paneId ?? null);
    setOverIndex(target?.index ?? null);
  };

  const handleDragEnd = (e: DragEndEvent) => {
    resetDrag();
    if (!tree) return;
    const { panes, byTermId } = indexTree(tree);
    const termId = String(e.active.id);
    const fromPane = byTermId.get(termId);
    if (!fromPane) return;

    const target = resolveOverTarget(e, panes, byTermId, fromPane.id);
    if (!target) return;

    if (fromPane.id === target.paneId) {
      const oldIdx = fromPane.tabs.findIndex((t) => t.id === termId);
      if (oldIdx < 0 || oldIdx === target.index) return;
      const ids = fromPane.tabs.map((t) => t.id);
      onReorder(fromPane.id, arrayMove(ids, oldIdx, target.index));
      return;
    }

    onMove(fromPane.id, termId, target.paneId, target.index);
  };

  const hoverState = useMemo<DndHoverState>(
    () => ({ activePaneId: active?.fromPaneId ?? null, overPaneId, overIndex }),
    [active?.fromPaneId, overPaneId, overIndex],
  );

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={tabPreferringCollision}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={resetDrag}
    >
      <DndHoverContext.Provider value={hoverState}>
        {children}
        <DragOverlay dropAnimation={null}>
          {active ? <HeaderTab label={active.label} active onClick={() => {}} /> : null}
        </DragOverlay>
      </DndHoverContext.Provider>
    </DndContext>
  );
}

interface TabStripProps {
  paneId: string;
  tabIds: string[];
  children: ReactNode;
}

// Returns the drop-hover state relative to a specific pane. Both TabStrip
// and SortableTab need "is this pane the cross-pane drop target?" plus
// the raw overIndex; extracting the check avoids repeating it.
function useCrossPaneHover(paneId: string): { isCrossPaneTarget: boolean; overIndex: number | null } {
  const { activePaneId, overPaneId, overIndex } = useContext(DndHoverContext);
  const isCrossPaneTarget =
    activePaneId !== null && activePaneId !== paneId && overPaneId === paneId;
  return { isCrossPaneTarget, overIndex };
}

const INDICATOR_BAR =
  "h-5 w-[3px] rounded-full bg-[var(--accent-cyan)] shadow-[0_0_8px_var(--accent-cyan)]";

// Inline rather than absolute: the trailing position has no tab to shift
// out from under the cursor, so the strip just grows — no flicker path.
function TrailingDropIndicator() {
  return <span aria-hidden className={`${INDICATOR_BAR} mx-px shrink-0`} />;
}

// Absolute-positioned so the host tab doesn't reflow when the bar
// appears. An inline bar shifts the tab right at the very-left edge,
// breaking pointer collision and flipping the drop to the strip droppable.
function LeadingDropIndicator() {
  return (
    <span
      aria-hidden
      className={`${INDICATOR_BAR} pointer-events-none absolute left-[-3px] top-1/2 -translate-y-1/2`}
    />
  );
}

// Per-pane sortable container + droppable background. The SortableContext
// scopes reordering to this pane's tabs; the droppable lets a drag land
// on the strip's empty space (so dropping onto a service-only pane still
// works — nothing to collide with otherwise).
export function TabStrip({ paneId, tabIds, children }: TabStripProps) {
  const { setNodeRef } = useDroppable({ id: tabStripDroppableId(paneId) });
  const { isCrossPaneTarget, overIndex } = useCrossPaneHover(paneId);
  const showTrailingIndicator = isCrossPaneTarget && overIndex === tabIds.length;
  return (
    <SortableContext id={paneId} items={tabIds} strategy={horizontalListSortingStrategy}>
      {/* pl-1 reserves space for the leading drop indicator, which is
          absolute-positioned at left: -3px on the first tab — without it
          the outer overflow-x-auto container clips the bar off-screen. */}
      <div ref={setNodeRef} className="flex items-center gap-0.5 pl-1">
        {children}
        {showTrailingIndicator && <TrailingDropIndicator />}
      </div>
    </SortableContext>
  );
}

interface SortableTabProps {
  id: string;
  paneId: string;
  index: number;
  children: ReactNode;
}

export function SortableTab({ id, paneId, index, children }: SortableTabProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const { isCrossPaneTarget, overIndex } = useCrossPaneHover(paneId);
  const showLeadingIndicator = isCrossPaneTarget && overIndex === index;
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : undefined,
    position: "relative",
  };
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      {showLeadingIndicator && <LeadingDropIndicator />}
      {children}
    </div>
  );
}

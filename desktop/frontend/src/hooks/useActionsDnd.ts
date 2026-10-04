import { type PointerEvent as ReactPointerEvent, useCallback, useEffect, useRef, useState } from "react";
import {
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  PointerSensor,
  type PointerSensorOptions,
  type SensorDescriptor,
  type SensorOptions,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type { ActionsLayout } from "../types";
import { type StructuralOp, detectGesture } from "../actionsGesture";
import { isChildId } from "../actionIds";
import {
  type ActionGroup,
  type ExtractIndicator,
  type MenuDrop,
  applyMove,
  crumbTargetOf,
  groupOf,
  isCrumbId,
  isGroupDropId,
  isNestId,
  isZoneDotsId,
  listOf,
  nestTargetOf,
  resolveTarget,
  sameLayout,
  zoneGroup,
  zoneOfDotsId,
} from "../components/actionsDndLayout";

export interface UseActionsDndOptions {
  layout: ActionsLayout;
  // No persist — repeated mid-drag.
  onPreview: (next: ActionsLayout) => void;
  // Persists — fired once on drop, with the layout the drag started from.
  onMove: (next: ActionsLayout, before: ActionsLayout) => void;
  // Fired on a drop classified as a structural gesture (nest/extract/
  // reorder); the caller then skips the flat reorder. false: refused.
  onStructural: (op: StructuralOp) => boolean | void;
  // True when both actions live in the same config layer — nesting across
  // layers is rejected.
  canNest: (activeId: string, targetId: string) => boolean;
  isMenu: (id: string) => boolean;
  // Where a dragged-out menu item would land, kept current by ActionsDnd's
  // collision detection so the drop can extract to that exact position.
  indicatorRef: { current: ExtractIndicator | null };
  // Inside an open drill menu, which sibling row the pointer is over and the
  // action (before/after/nest) from its third. Kept current by collision
  // detection; read at drop to commit the reorder or nest.
  menuDropRef: { current: MenuDrop | null };
  // Called from the start, end and cancel handlers, so the caller's own state
  // changes in the same render as the drag's.
  onDragActiveChange?: (active: boolean) => void;
  // The list a zone takes drops into: its open layer's.
  openListOf?: (zone: string) => string;
}

// How the lifted button settles on release: flying to its slot, or, when the
// drop changed the menus, shrinking away where it was let go.
export type DropSettle = "move" | "absorb";

export interface UseActionsDndResult {
  sensors: SensorDescriptor<SensorOptions>[];
  activeId: string | null;
  overGroup: ActionGroup | null;
  // The row or zone list the dragged button started in.
  origin: ActionGroup | null;
  // True while the pointer is away from every row, zone and menu, where a
  // release puts the button back.
  outside: boolean;
  settle: DropSettle;
  // The item a drop just moved into or out of a menu, until the change shows.
  settlingId: string | null;
  onDragStart: (event: DragStartEvent) => void;
  onDragOver: (event: DragOverEvent) => void;
  onDragCancel: () => void;
  onDragEnd: (event: DragEndEvent) => void;
}

// The activation threshold lets a quick click pass through to onClick
// rather than start a drag. Pointer only: keyboard and touch sensors
// are deliberately absent — without a dedicated drag handle, dnd-kit's
// KeyboardSensor hijacks Enter/Space on the buttons and starts a drag
// that mouse input can never end, leaving a stuck overlay that blocks
// clicks.
const POINTER_OPTS = { activationConstraint: { distance: 5 } } as const;

// On macOS a control-click is a right-click: it opens the button's context
// menu, and a pending drag would block that menu and could start moving the
// button under it.
class PrimaryPointerSensor extends PointerSensor {
  static activators = PointerSensor.activators.map((activator) => ({
    ...activator,
    handler: (event: ReactPointerEvent, options: PointerSensorOptions) =>
      !event.nativeEvent.ctrlKey && activator.handler(event, options),
  }));
}

// dnd-kit stops the click that ends a drop, but not one that follows a
// cancel: after an Escape mid-drag, letting go over a button would run it.
// The next press is a fresh gesture, so it lifts the block.
// It belongs to the press being let go: it ends right after the release (the
// click fires in the same task), at a key press, or soon in any case, so a
// later keyboard or scripted click is never eaten.
function swallowNextClick(): void {
  const swallow = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    lift();
  };
  const afterRelease = () => setTimeout(lift, 0);
  const timer = setTimeout(() => lift(), 1000);
  const lift = () => {
    clearTimeout(timer);
    window.removeEventListener("click", swallow, true);
    window.removeEventListener("pointerdown", lift, true);
    window.removeEventListener("keydown", lift, true);
    window.removeEventListener("pointerup", afterRelease, true);
  };
  window.addEventListener("click", swallow, true);
  window.addEventListener("pointerdown", lift, true);
  window.addEventListener("keydown", lift, true);
  window.addEventListener("pointerup", afterRelease, true);
}

// Multi-container sortable: snapshot layout at drag-start, preview only
// on cross-group moves (within-group reorder rides on SortableContext for
// free), commit on drop against the snapshot. Handlers read live values
// via refs because dnd-kit holds the handler reference for the whole drag.
export function useActionsDnd({
  layout,
  onPreview,
  onMove,
  onStructural,
  canNest,
  isMenu,
  indicatorRef,
  menuDropRef,
  onDragActiveChange,
  openListOf = (zone) => zone,
}: UseActionsDndOptions): UseActionsDndResult {
  const sensors = useSensors(useSensor(PrimaryPointerSensor, POINTER_OPTS));
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overGroup, setOverGroup] = useState<ActionGroup | null>(null);
  const [settle, setSettle] = useState<DropSettle>("move");
  const [outside, setOutside] = useState(false);
  const [origin, setOrigin] = useState<ActionGroup | null>(null);
  const [settlingId, setSettlingId] = useState<string | null>(null);
  const baselineRef = useRef<ActionsLayout | null>(null);

  const layoutRef = useRef(layout);
  const onPreviewRef = useRef(onPreview);
  const onMoveRef = useRef(onMove);
  const onStructuralRef = useRef(onStructural);
  const canNestRef = useRef(canNest);
  const isMenuRef = useRef(isMenu);
  const onDragActiveChangeRef = useRef(onDragActiveChange);
  const openListOfRef = useRef(openListOf);
  openListOfRef.current = openListOf;
  layoutRef.current = layout;
  onPreviewRef.current = onPreview;
  onMoveRef.current = onMove;
  onStructuralRef.current = onStructural;
  canNestRef.current = canNest;
  isMenuRef.current = isMenu;
  onDragActiveChangeRef.current = onDragActiveChange;

  // An unmount mid-drag gets no end or cancel: drop the baseline so it can't
  // leak, and tell the page the drag is over so it doesn't wait for one.
  useEffect(
    () => () => {
      if (baselineRef.current) onDragActiveChangeRef.current?.(false);
      baselineRef.current = null;
    },
    [],
  );

  const onDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(String(event.active.id));
    setOrigin(groupOf(layoutRef.current, String(event.active.id)));
    setOverGroup(null);
    setOutside(false);
    setSettle("move");
    setSettlingId(null);
    onDragActiveChangeRef.current?.(true);
    baselineRef.current = layoutRef.current;
    menuDropRef.current = null;
  }, [menuDropRef]);

  const revertToBaseline = useCallback((baseline: ActionsLayout) => {
    if (!sameLayout(layoutRef.current, baseline)) onPreviewRef.current(baseline);
  }, []);

  const onDragOver = useCallback((event: DragOverEvent) => {
    const { active, over } = event;
    setOutside(!over);
    // A dragged-out menu item isn't a member of the row's sortable list, so
    // the flat cross-group preview doesn't apply — its placeholder is driven
    // by the extract indicator instead.
    if (isChildId(String(active.id))) {
      setOverGroup(null);
      return;
    }
    // Away from everything the button shows back where it started, as a
    // release there would leave it.
    if (!over) {
      setOverGroup(null);
      if (baselineRef.current) revertToBaseline(baselineRef.current);
      return;
    }
    const currentLayout = layoutRef.current;
    // The dots switch layers on a hover. Nothing moves while the pointer is on
    // them: a button joining the open layer could widen the zone and slide the
    // dots out from under the pointer before the hover opens another layer.
    if (isZoneDotsId(String(over.id))) {
      setOverGroup(zoneGroup(openListOfRef.current(zoneOfDotsId(String(over.id)))));
      return;
    }
    const target = resolveTarget(String(over.id), currentLayout);
    setOverGroup(target?.group ?? null);
    if (!target || !baselineRef.current) return;
    const draggedId = String(active.id);
    // Within-group moves are handled by SortableContext alone. Previewing
    // them too would feedback-loop: preview → re-shuffle → onDragOver →
    // preview … React bails with "Maximum update depth".
    if (groupOf(currentLayout, draggedId) === target.group) return;
    const next = applyMove(baselineRef.current, draggedId, target);
    if (sameLayout(currentLayout, next)) return;
    onPreviewRef.current(next);
  }, [revertToBaseline]);

  const onDragCancel = useCallback(() => {
    swallowNextClick();
    setActiveId(null);
    setOverGroup(null);
    setOutside(false);
    menuDropRef.current = null;
    const baseline = baselineRef.current;
    baselineRef.current = null;
    if (baseline) revertToBaseline(baseline);
    onDragActiveChangeRef.current?.(false);
  }, [revertToBaseline, menuDropRef]);

  // Commits or reverts the drop; the caller hears the drag is over only after,
  // so a save has taken its own refresh hold before the drag's is let go.
  const settleDrop = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    const baseline = baselineRef.current;
    baselineRef.current = null;
    // Inside an open drill menu the drop-indicator model decides the gesture:
    // its third within the hovered sibling is nest (extractOnto) or a reorder
    // before/after. Read-and-clear so no stale target survives.
    const menuDrop = menuDropRef.current;
    menuDropRef.current = null;
    if (!baseline) return;
    // Let go away from every row, zone and menu: nothing changes.
    if (!over) return revertToBaseline(baseline);
    const current = layoutRef.current;
    // A menu child let go over a row's empty part extracts to the top level. A
    // child target id (parent:child) is an item; only group drop ids are not.
    const draggedId = String(active.id);
    const overId = String(over.id);
    // A breadcrumb drop moves the child out one level; it takes precedence, so
    // the nest/item targets are suppressed and detectGesture keys off crumbTarget.
    const crumbTarget = isCrumbId(overId) ? crumbTargetOf(overId) : undefined;
    const onCrumb = crumbTarget !== undefined;
    const menuNest = menuDrop && !onCrumb && menuDrop.mode === "nest" ? menuDrop.target : null;
    const menuReorderOver = menuDrop && !onCrumb && menuDrop.mode !== "nest" ? menuDrop.target : null;
    const reorderPosition =
      menuDrop && menuReorderOver ? (menuDrop.mode as "before" | "after") : undefined;
    // A menu nest overrides the raw over target: feed it as the nest target and
    // suppress the over-derived item so reorder can't win. A menu reorder routes
    // through overItemId carrying the before/after side.
    const overNestTarget =
      menuNest ?? (!onCrumb && isNestId(overId) ? nestTargetOf(overId) : null);
    const overItemId =
      menuReorderOver ??
      (menuDrop || onCrumb || isGroupDropId(overId) || isNestId(overId) ? null : overId);
    const op = detectGesture({
      draggedId,
      draggedIsMenu: isMenuRef.current(draggedId),
      overNestTarget,
      overItemId,
      sameLevel:
        (overNestTarget ?? menuReorderOver) !== null &&
        canNestRef.current(draggedId, overNestTarget ?? menuReorderOver ?? ""),
      extractTarget: indicatorRef.current,
      crumbTarget,
      reorderPosition,
    });
    if (op) {
      // A refused op puts the button back, so it flies home like any revert.
      const accepted = onStructuralRef.current(op) !== false;
      setSettle(accepted ? "absorb" : "move");
      if (accepted) setSettlingId(draggedId);
      else revertToBaseline(baseline);
      return;
    }
    // Cursor on the dragged item's own placeholder: the preview already
    // represents where the user wants it to land — commit current as
    // final. (Without this, cross-group drops snap back to baseline
    // because dnd-kit reports `over` as the active id.)
    if (draggedId === overId) {
      if (sameLayout(baseline, current)) return;
      onMoveRef.current(current, baseline);
      return;
    }
    // Let go on a zone's dots: the button joins the end of the layer showing.
    const dotsGroup = isZoneDotsId(overId) ? zoneGroup(openListOfRef.current(zoneOfDotsId(overId))) : null;
    const target = dotsGroup ? { group: dotsGroup, index: listOf(baseline, dotsGroup).length } : resolveTarget(overId, current);
    if (!target) return revertToBaseline(baseline);
    const final = applyMove(baseline, draggedId, target);
    if (sameLayout(baseline, final)) return revertToBaseline(baseline);
    onMoveRef.current(final, baseline);
  }, [revertToBaseline, indicatorRef, menuDropRef]);

  const onDragEnd = useCallback((event: DragEndEvent) => {
    setActiveId(null);
    setOverGroup(null);
    setOutside(false);
    settleDrop(event);
    onDragActiveChangeRef.current?.(false);
  }, [settleDrop]);

  return { sensors, activeId, overGroup, origin, outside, settle, settlingId, onDragStart, onDragOver, onDragCancel, onDragEnd };
}

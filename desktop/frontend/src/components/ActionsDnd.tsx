import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { DndContext, type DragStartEvent, DragOverlay } from "@dnd-kit/core";
import { getEventCoordinates } from "@dnd-kit/utilities";
import { isChildId } from "../actionIds";
import type { ActionsLayout } from "../types";
import type { StructuralOp } from "../actionsGesture";
import { useActionsDnd } from "../hooks/useActionsDnd";
import type { ActionGroup, ExtractIndicator, MenuDrop } from "./actionsDndLayout";
import { announcements } from "./actionsAnnouncements";
import { createActionsCollision } from "./actionsCollision";
import {
  OUTSIDE_STYLE,
  absorbAnimation,
  dropAnimation,
  fitContent,
  modifiers,
  overMenu,
  reducedMotionDropAnimation,
} from "./actionsDragMotion";
import { RowsRemeasure } from "./RowsRemeasure";
import type { HeldCollision } from "./holdWhilePointerStill";
import { useDragBodyAttribute } from "../hooks/useDragBodyAttribute";
import { usePrefersReducedMotion } from "../hooks/usePrefersReducedMotion";

// While dragging a menu item out, this reports the row + gap it would land
// in, so the row can open an insertion placeholder. null when not extracting.
const ExtractIndicatorContext = createContext<ExtractIndicator | null>(null);

export function useExtractIndicator(): ExtractIndicator | null {
  return useContext(ExtractIndicatorContext);
}

// The indicator's row alone, for readers that would otherwise re-render on
// every gap the pointer crosses.
const ExtractGroupContext = createContext<ActionGroup | null>(null);

export function useExtractGroup(): ActionGroup | null {
  return useContext(ExtractGroupContext);
}

// While dragging a row within an open drill menu, this reports which sibling
// the pointer is over and the action (before/after/nest). Rows read it to draw
// the insertion line or nest highlight. null when not over a sibling row.
const MenuDropContext = createContext<MenuDrop | null>(null);

export function useMenuDrop(): MenuDrop | null {
  return useContext(MenuDropContext);
}

// The id of the row currently being dragged, so menu rows can ghost themselves
// in place (they're plain droppables now, not sortables that move out of view).
const ActiveIdContext = createContext<string | null>(null);

export function useActionsActiveId(): string | null {
  return useContext(ActiveIdContext);
}

// Which row or zone the dragged button is over, so a zone can tint itself.
// Flips only when the target group changes, not on every pointer move.
const OverGroupContext = createContext<ActionGroup | null>(null);

export function useActionsOverGroup(): ActionGroup | null {
  return useContext(OverGroupContext);
}

// The item a drop just moved into or out of a menu. It stays out of sight
// until the change shows: the drop animation alone would hand it back to its
// old place for as long as the save and refresh take.
const SettlingContext = createContext<string | null>(null);

export function useActionsSettlingId(): string | null {
  return useContext(SettlingContext);
}

const SETTLE_LIMIT_MS = 2000;

// The row or zone list the dragged button started in.
const OriginContext = createContext<ActionGroup | null>(null);

export function useActionsDragOrigin(): ActionGroup | null {
  return useContext(OriginContext);
}

// Resting the pointer in a button's leading part offers to nest the dragged
// one into it; after NEST_ARM_MS the offer is armed and a drop nests.
export const NEST_ARM_MS = 600;

export interface NestIntent {
  target: string;
  armed: boolean;
}

const NestIntentContext = createContext<NestIntent | null>(null);

export function useNestIntent(): NestIntent | null {
  return useContext(NestIntentContext);
}

interface ActionsDndProps {
  layout: ActionsLayout;
  onMove: (next: ActionsLayout, before: ActionsLayout) => void;
  onPreview: (next: ActionsLayout) => void;
  // false: the op was refused and the drag puts the button back.
  onStructural: (op: StructuralOp) => boolean | void;
  // True when both actions live in the same config layer. Gates which
  // items are valid nest targets while dragging.
  canNest: (activeId: string, targetId: string) => boolean;
  isMenu: (id: string) => boolean;
  renderOverlay: (id: string, overGroup: ActionGroup | null, nestInto: string | null) => ReactNode;
  // Told when a drag starts and ends, so the page can hold layout work that
  // would move the rows to another parent mid-drag.
  onDragActiveChange?: (active: boolean) => void;
  // The list a zone takes drops into: its open layer's.
  openListOf?: (zone: string) => string;
  children: ReactNode;
}

const accessibility = { announcements };

// Not useDndContext: dnd-kit's public context changes identity every
// pointermove; this boolean flips only at drag start/end.
const DragActiveContext = createContext(false);

export function useActionsDragActive(): boolean {
  return useContext(DragActiveContext);
}

// Module-scoped — a fresh object each render would force dnd-kit's
// useAutoScroller to teardown/setup on every parent re-render.
const autoScrollOptions = {
  threshold: { x: 0.15, y: 0 },
  acceleration: 8,
  layoutShiftCompensation: false,
} as const;

export function ActionsDnd({
  layout,
  onMove,
  onPreview,
  onStructural,
  canNest,
  isMenu,
  renderOverlay,
  onDragActiveChange,
  openListOf,
  children,
}: ActionsDndProps) {
  // Collision detection runs while DndContext renders, where this component's
  // state can't be set. The refs change at once for the drop handler to read;
  // the state follows right after that render.
  const [indicator, setIndicator] = useState<ExtractIndicator | null>(null);
  const indicatorRef = useRef<ExtractIndicator | null>(null);
  const updateIndicator = useCallback((next: ExtractIndicator | null) => {
    const prev = indicatorRef.current;
    if (prev?.group === next?.group && prev?.index === next?.index) return;
    indicatorRef.current = next;
    queueMicrotask(() => setIndicator(indicatorRef.current));
  }, []);

  const [menuDrop, setMenuDrop] = useState<MenuDrop | null>(null);
  const menuDropRef = useRef<MenuDrop | null>(null);
  const updateMenuDrop = useCallback((next: MenuDrop | null) => {
    const prev = menuDropRef.current;
    if (prev?.target === next?.target && prev?.mode === next?.mode) return;
    menuDropRef.current = next;
    queueMicrotask(() => setMenuDrop(menuDropRef.current));
  }, []);

  const heldCollisionRef = useRef<HeldCollision | null>(null);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);

  const [nestIntent, setNestIntent] = useState<NestIntent | null>(null);
  const nestIntentRef = useRef<NestIntent | null>(null);
  const nestArmedRef = useRef<string | null>(null);
  const nestTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showNestIntent = useCallback((next: NestIntent | null) => {
    nestIntentRef.current = next;
    nestArmedRef.current = next?.armed ? next.target : null;
    queueMicrotask(() => setNestIntent(nestIntentRef.current));
  }, []);
  const offerNest = useCallback(
    (target: string | null) => {
      if ((nestIntentRef.current?.target ?? null) === target) return;
      if (nestTimerRef.current !== null) clearTimeout(nestTimerRef.current);
      nestTimerRef.current = null;
      showNestIntent(target === null ? null : { target, armed: false });
      if (target === null) return;
      nestTimerRef.current = setTimeout(() => {
        nestTimerRef.current = null;
        showNestIntent({ target, armed: true });
      }, NEST_ARM_MS);
    },
    [showNestIntent],
  );
  useEffect(
    () => () => {
      if (nestTimerRef.current !== null) clearTimeout(nestTimerRef.current);
    },
    [],
  );

  const { sensors, activeId, overGroup, origin, outside, settle, settlingId: settledId, onDragStart, onDragOver, onDragCancel, onDragEnd } = useActionsDnd({
    layout,
    onMove,
    onPreview,
    onStructural,
    canNest,
    isMenu,
    indicatorRef,
    menuDropRef,
    onDragActiveChange,
    openListOf,
  });
  const reduceMotion = usePrefersReducedMotion();
  const dragging = activeId !== null;
  const childDrag = activeId !== null && isChildId(activeId);
  useDragBodyAttribute(dragging);

  useEffect(() => {
    if (activeId === null) {
      // Set directly: the drop handler may already have cleared the refs,
      // which would make the update helpers skip the state.
      indicatorRef.current = null;
      setIndicator(null);
      menuDropRef.current = null;
      setMenuDrop(null);
      heldCollisionRef.current = null;
      offerNest(null);
    }
  }, [activeId, offerNest]);

  // Shown again once the layout changes after the drop (the refresh that
  // carries the change), or after a while if it never comes.
  const [settlingId, setSettlingId] = useState<string | null>(null);
  const settledFromRef = useRef(layout);
  useEffect(() => {
    settledFromRef.current = layout;
    setSettlingId(settledId);
    if (settledId === null) return;
    const timer = setTimeout(() => setSettlingId(null), SETTLE_LIMIT_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settledId]);
  useEffect(() => {
    if (layout !== settledFromRef.current) setSettlingId(null);
  }, [layout]);

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      dragStartRef.current = getEventCoordinates(event.activatorEvent);
      onDragStart(event);
    },
    [onDragStart],
  );

  const collisionDetection = useMemo(
    () =>
      createActionsCollision({
        layout,
        canNest,
        updateIndicator,
        updateMenuDrop,
        held: heldCollisionRef,
        openListOf,
        offerNest,
        nestArmed: nestArmedRef,
        overMenu,
        dragStart: dragStartRef,
      }),
    [canNest, layout, updateIndicator, updateMenuDrop, openListOf, offerNest],
  );

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={handleDragStart}
      onDragOver={onDragOver}
      onDragCancel={onDragCancel}
      onDragEnd={onDragEnd}
      accessibility={accessibility}
      autoScroll={autoScrollOptions}
      modifiers={modifiers}
    >
      <DragActiveContext.Provider value={dragging}>
       <ActiveIdContext.Provider value={activeId}>
       <ExtractIndicatorContext.Provider value={indicator}>
       <ExtractGroupContext.Provider value={indicator?.group ?? null}>
       <MenuDropContext.Provider value={menuDrop}>
       <OverGroupContext.Provider value={overGroup}>
       <NestIntentContext.Provider value={nestIntent}>
       <OriginContext.Provider value={origin}>
       <SettlingContext.Provider value={settlingId}>
        {children}
        {dragging && <RowsRemeasure layout={layout} />}
        {/* pointer-events-none must sit on DragOverlay itself: it lands on
            the position:fixed wrapper dnd-kit hit-tests, so the overlay can
            never swallow clicks aimed at the buttons beneath it. On a child
            div it has no effect — the wrapper still intercepts. */}
        <DragOverlay
          className="pointer-events-none"
          style={childDrag ? fitContent : undefined}
          dropAnimation={reduceMotion ? reducedMotionDropAnimation : settle === "absorb" ? absorbAnimation : dropAnimation}
        >
          {activeId ? (
            // Faded while a release would put the button back.
            <div className="lpm-actions-overlay transition-opacity duration-150" style={outside ? OUTSIDE_STYLE : undefined}>
              {renderOverlay(
                activeId,
                // A menu item has no over group; it takes the size of the row it would land in.
                overGroup ?? (childDrag ? (indicator?.group ?? null) : null),
                nestIntent?.armed ? nestIntent.target : null,
              )}
            </div>
          ) : null}
        </DragOverlay>
       </SettlingContext.Provider>
       </OriginContext.Provider>
       </NestIntentContext.Provider>
       </OverGroupContext.Provider>
       </MenuDropContext.Provider>
       </ExtractGroupContext.Provider>
       </ExtractIndicatorContext.Provider>
       </ActiveIdContext.Provider>
      </DragActiveContext.Provider>
    </DndContext>
  );
}

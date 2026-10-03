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
import { DndContext, DragOverlay, defaultDropAnimation } from "@dnd-kit/core";
import type { ActionsLayout } from "../types";
import type { StructuralOp } from "../actionsGesture";
import { useActionsDnd } from "../hooks/useActionsDnd";
import type { ActionGroup, ExtractIndicator, MenuDrop } from "./actionsDndLayout";
import { announcements } from "./actionsAnnouncements";
import { createActionsCollision } from "./actionsCollision";
import type { HeldCollision } from "./holdWhilePointerStill";
import { useDragBodyAttribute } from "../hooks/useDragBodyAttribute";
import { usePrefersReducedMotion } from "../hooks/usePrefersReducedMotion";

// While dragging a menu item out, this reports the row + gap it would land
// in, so the row can open an insertion placeholder. null when not extracting.
const ExtractIndicatorContext = createContext<ExtractIndicator | null>(null);

export function useExtractIndicator(): ExtractIndicator | null {
  return useContext(ExtractIndicatorContext);
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

interface ActionsDndProps {
  layout: ActionsLayout;
  onMove: (next: ActionsLayout, before: ActionsLayout) => void;
  onPreview: (next: ActionsLayout) => void;
  onStructural: (op: StructuralOp) => void;
  // True when both actions live in the same config layer. Gates which
  // items are valid nest targets while dragging.
  canNest: (activeId: string, targetId: string) => boolean;
  isMenu: (id: string) => boolean;
  renderOverlay: (id: string, overGroup: ActionGroup | null) => ReactNode;
  // Told when a drag starts and ends, so the page can hold layout work that
  // would move the rows to another parent mid-drag.
  onDragActiveChange?: (active: boolean) => void;
  // The list a zone takes drops into: its open layer's.
  openListOf?: (zone: string) => string;
  children: ReactNode;
}

const dropAnimation = {
  ...defaultDropAnimation,
  duration: 250,
  easing: "cubic-bezier(0.18, 0.89, 0.32, 1.28)",
};

const reducedMotionDropAnimation = {
  ...defaultDropAnimation,
  duration: 0,
  easing: "linear",
};

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
  const [indicator, setIndicator] = useState<ExtractIndicator | null>(null);
  const indicatorRef = useRef<ExtractIndicator | null>(null);
  const updateIndicator = useCallback((next: ExtractIndicator | null) => {
    const prev = indicatorRef.current;
    if (prev?.group === next?.group && prev?.index === next?.index) return;
    indicatorRef.current = next;
    setIndicator(next);
  }, []);

  const [menuDrop, setMenuDrop] = useState<MenuDrop | null>(null);
  const menuDropRef = useRef<MenuDrop | null>(null);
  const updateMenuDrop = useCallback((next: MenuDrop | null) => {
    const prev = menuDropRef.current;
    if (prev?.target === next?.target && prev?.mode === next?.mode) return;
    menuDropRef.current = next;
    setMenuDrop(next);
  }, []);

  const heldCollisionRef = useRef<HeldCollision | null>(null);

  const { sensors, activeId, overGroup, onDragStart, onDragOver, onDragCancel, onDragEnd } = useActionsDnd({
    layout,
    onMove,
    onPreview,
    onStructural,
    canNest,
    isMenu,
    indicatorRef,
    menuDropRef,
    onDragActiveChange,
  });
  const reduceMotion = usePrefersReducedMotion();
  const dragging = activeId !== null;
  useDragBodyAttribute(dragging);

  useEffect(() => {
    if (activeId === null) {
      updateIndicator(null);
      menuDropRef.current = null;
      setMenuDrop(null);
      heldCollisionRef.current = null;
    }
  }, [activeId, updateIndicator]);

  const collisionDetection = useMemo(
    () =>
      createActionsCollision({
        layout,
        canNest,
        updateIndicator,
        updateMenuDrop,
        held: heldCollisionRef,
        openListOf,
      }),
    [canNest, layout, updateIndicator, updateMenuDrop, openListOf],
  );

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragCancel={onDragCancel}
      onDragEnd={onDragEnd}
      accessibility={accessibility}
      autoScroll={autoScrollOptions}
    >
      <DragActiveContext.Provider value={dragging}>
       <ActiveIdContext.Provider value={activeId}>
       <ExtractIndicatorContext.Provider value={indicator}>
       <MenuDropContext.Provider value={menuDrop}>
       <OverGroupContext.Provider value={overGroup}>
        {children}
        {/* pointer-events-none must sit on DragOverlay itself: it lands on
            the position:fixed wrapper dnd-kit hit-tests, so the overlay can
            never swallow clicks aimed at the buttons beneath it. On a child
            div it has no effect — the wrapper still intercepts. */}
        <DragOverlay
          className="pointer-events-none"
          dropAnimation={reduceMotion ? reducedMotionDropAnimation : dropAnimation}
        >
          {activeId ? (
            <div
              className="lpm-actions-overlay"
              style={{ transform: reduceMotion ? undefined : "scale(1.04) rotate(-1.5deg)" }}
            >
              {renderOverlay(activeId, overGroup)}
            </div>
          ) : null}
        </DragOverlay>
       </OverGroupContext.Provider>
       </MenuDropContext.Provider>
       </ExtractIndicatorContext.Provider>
       </ActiveIdContext.Provider>
      </DragActiveContext.Provider>
    </DndContext>
  );
}

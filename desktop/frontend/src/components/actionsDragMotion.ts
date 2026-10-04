import {
  type DropAnimation,
  type DropAnimationSideEffects,
  type Modifier,
  defaultDropAnimation,
  defaultDropAnimationSideEffects,
} from "@dnd-kit/core";
import { CSS, getEventCoordinates } from "@dnd-kit/utilities";
import { isChildId } from "../actionIds";

const DROP_MS = 250;

const hideSource = defaultDropAnimationSideEffects({ styles: { active: { opacity: "0" } } });

// The lifted button straightens out as it lands instead of snapping flat after.
const landFlat: DropAnimationSideEffects = (parameters) => {
  const cleanup = hideSource(parameters);
  parameters.dragOverlay.node
    .querySelector<HTMLElement>(".lpm-actions-overlay")
    ?.animate([{ transform: "none" }], { duration: DROP_MS, easing: "ease-out", fill: "forwards" });
  return cleanup;
};

export const dropAnimation: DropAnimation = {
  ...defaultDropAnimation,
  duration: DROP_MS,
  easing: "cubic-bezier(0.18, 0.89, 0.32, 1.28)",
  sideEffects: landFlat,
};

// A nest or a move between menus has no slot in a row to fly to; flying back
// to where the drag began would read as a cancel.
export const absorbAnimation: DropAnimation = {
  duration: 160,
  easing: "ease-in",
  keyframes: ({ transform }) => [
    { opacity: 1, transform: CSS.Transform.toString(transform.initial) },
    { opacity: 0, transform: CSS.Transform.toString({ ...transform.initial, scaleX: 0.85, scaleY: 0.85 }) },
  ],
  sideEffects: hideSource,
};

export const reducedMotionDropAnimation: DropAnimation = {
  ...defaultDropAnimation,
  duration: 0,
  easing: "linear",
};

// A menu item is picked up from a row as wide as its menu; the button it
// becomes is centred on the pointer instead of keeping the row's grab offset.
const centreMenuItemOnPointer: Modifier = ({ active, activatorEvent, draggingNodeRect, transform }) => {
  if (!active || !isChildId(String(active.id)) || !draggingNodeRect || !activatorEvent) return transform;
  const start = getEventCoordinates(activatorEvent);
  if (!start) return transform;
  return {
    ...transform,
    x: transform.x + start.x - draggingNodeRect.left - draggingNodeRect.width / 2,
    y: transform.y + start.y - draggingNodeRect.top - draggingNodeRect.height / 2,
  };
};
export const modifiers = [centreMenuItemOnPointer];
export const fitContent = { width: "auto", height: "auto" } as const;
export const OUTSIDE_STYLE = { opacity: 0.5 } as const;

// Open menus are portaled; their rects cover whatever action rows they overlap.
export function overMenu({ x, y }: { x: number; y: number }): boolean {
  return [...document.querySelectorAll("[data-actions-menu]")].some((menu) => {
    const r = menu.getBoundingClientRect();
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  });
}

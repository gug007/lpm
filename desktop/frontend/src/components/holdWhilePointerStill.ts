import type { Collision, CollisionDetection } from "@dnd-kit/core";

export interface HeldCollision {
  x: number;
  y: number;
  result: Collision[];
}

// A preview or an opened insertion gap reflows the rows, which can slide
// another target under a pointer that hasn't moved; following it would undo
// the change and redo it until React gives up. A still pointer keeps the
// answer it last settled on, so what the drag shows is where it drops.
export function holdWhilePointerStill(
  detect: CollisionDetection,
  held: { current: HeldCollision | null },
): CollisionDetection {
  return (args) => {
    const pointer = args.pointerCoordinates;
    if (!pointer) return detect(args);
    const last = held.current;
    if (last && last.x === pointer.x && last.y === pointer.y) return last.result;
    const result = detect(args);
    // The first renders of a drag have no measured rects yet; don't hold those.
    if (args.droppableRects.size > 0) held.current = { x: pointer.x, y: pointer.y, result };
    return result;
  };
}

import { useDroppable } from "@dnd-kit/core";
import { nestId } from "./actionsDndLayout";
import { useNestIntent } from "./ActionsDnd";

// Solid, unlike the dashed slot the dragged button leaves, so a nest never
// reads as a reorder. While the pointer rests, the ring fills in over the wait.
export function NestDropZone({ targetId, rounded }: { targetId: string; rounded: string }) {
  const { setNodeRef, isOver } = useDroppable({ id: nestId(targetId) });
  const intent = useNestIntent();
  const offered = intent?.target === targetId;
  // Over it without an offer: a menu item back on its own menu, which reads
  // as a valid place to let go.
  const armed = isOver || (offered && intent.armed);
  return (
    <>
      <div ref={setNodeRef} className="pointer-events-none absolute inset-0" />
      {(offered || isOver) && (
        <div
          aria-hidden
          className={`pointer-events-none absolute inset-0 ${rounded} outline-2 -outline-offset-1 outline-solid ${
            armed ? "bg-[var(--accent-blue)]/15 outline-[var(--accent-blue)]" : "lpm-nest-charging"
          }`}
        />
      )}
    </>
  );
}

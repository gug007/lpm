import { useDroppable } from "@dnd-kit/core";
import { nestId } from "./actionsDndLayout";

export function NestDropZone({ targetId }: { targetId: string }) {
  const { setNodeRef, isOver } = useDroppable({ id: nestId(targetId) });
  return (
    <>
      <div ref={setNodeRef} className="pointer-events-none absolute inset-0" />
      {isOver && (
        <div className="pointer-events-none absolute inset-0 rounded-lg outline-2 -outline-offset-2 outline-dashed outline-[var(--accent-blue)]" />
      )}
    </>
  );
}

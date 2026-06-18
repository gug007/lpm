import { type ReactNode } from "react";
import { useDroppable } from "@dnd-kit/core";

interface FolderDropZoneProps {
  id: string;
  // overlay: an absolute, click-through layer stacked over a folder header.
  // Otherwise a static box (used for the empty-folder drop target).
  overlay?: boolean;
  className?: string;
  children?: ReactNode;
}

const HIGHLIGHT =
  "rounded-md outline-2 -outline-offset-2 outline-dashed outline-[var(--accent-cyan)]";

export function FolderDropZone({ id, overlay = false, className, children }: FolderDropZoneProps) {
  const { setNodeRef, isOver } = useDroppable({ id });
  if (overlay) {
    return (
      <div ref={setNodeRef} className="pointer-events-none absolute inset-0">
        {isOver && <div className={`pointer-events-none absolute inset-0 ${HIGHLIGHT}`} />}
      </div>
    );
  }
  return (
    <div ref={setNodeRef} className={`${className ?? ""} ${isOver ? HIGHLIGHT : ""}`}>
      {children}
    </div>
  );
}

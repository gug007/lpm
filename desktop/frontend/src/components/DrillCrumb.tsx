import { useEffect, useRef } from "react";
import { useDroppable } from "@dnd-kit/core";
import { crumbId } from "./actionsDndLayout";
import { SPRING_LOAD_MS } from "./springLoad";

export function DrillCrumb({
  title,
  path,
  onNavigate,
}: {
  title: string;
  path: string;
  onNavigate: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: crumbId(path) });
  const navigateRef = useRef(onNavigate);
  navigateRef.current = onNavigate;

  useEffect(() => {
    if (!isOver) return;
    const timer = setTimeout(() => navigateRef.current(), SPRING_LOAD_MS);
    return () => clearTimeout(timer);
  }, [isOver]);

  return (
    <button
      ref={setNodeRef}
      onClick={onNavigate}
      className={`min-w-0 max-w-[140px] shrink truncate rounded-md px-1.5 py-0.5 text-[12.5px] font-medium transition-colors ${
        isOver
          ? "bg-[var(--accent-blue)]/15 text-[var(--text-primary)] outline-2 -outline-offset-2 outline-dashed outline-[var(--accent-blue)]"
          : "text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
      }`}
    >
      {title}
    </button>
  );
}

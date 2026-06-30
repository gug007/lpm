import { type CSSProperties } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Generator } from "../types";
import { GeneratorIconView } from "./generatorIcons";

interface GeneratorRowProps {
  generator: Generator;
  onRun: (g: Generator) => void;
  onEdit: (g: Generator) => void;
  onRemove: (g: Generator) => void;
  onContextMenu: (g: Generator, x: number, y: number) => void;
}

export function GeneratorRow({ generator, onRun, onEdit, onRemove, onContextMenu }: GeneratorRowProps) {
  const { listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: generator.id });
  const style: CSSProperties = { transform: CSS.Transform.toString(transform), transition };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group flex items-center ${isDragging ? "opacity-60" : ""}`}
      onContextMenu={(e) => {
        e.preventDefault();
        onContextMenu(generator, e.clientX, e.clientY);
      }}
      {...listeners}
    >
      <button
        onClick={() => onRun(generator)}
        className="flex min-w-0 flex-1 items-center gap-2.5 px-4 py-2 text-left text-[13px] text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] cursor-grab"
      >
        <span className="flex h-5 w-5 shrink-0 items-center justify-center">
          <GeneratorIconView icon={generator.icon} size={18} />
        </span>
        <span className="min-w-0 flex-1 truncate">{generator.label}</span>
      </button>
      <div className="flex shrink-0 items-center gap-0.5 pr-2 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          aria-label="Edit"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onEdit(generator); }}
          className="flex h-6 w-6 items-center justify-center rounded text-[11px] text-[var(--text-muted)] hover:bg-[var(--bg-active)] hover:text-[var(--text-primary)]"
        >✎</button>
        <button
          aria-label="Remove"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onRemove(generator); }}
          className="flex h-6 w-6 items-center justify-center rounded text-[11px] text-[var(--text-muted)] hover:bg-[var(--bg-active)] hover:text-[var(--accent-red)]"
        >✕</button>
      </div>
    </div>
  );
}

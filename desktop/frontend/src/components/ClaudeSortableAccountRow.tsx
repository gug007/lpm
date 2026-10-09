import type { ComponentProps, KeyboardEvent } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { ClaudeAccountListRow } from "./ClaudeAccountListRow";

type RowProps = Omit<ComponentProps<typeof ClaudeAccountListRow>, "handle" | "indent">;

interface ClaudeSortableAccountRowProps extends RowProps {
  id: string;
  // Arrow keys on the handle move the account one place.
  onMove: (delta: -1 | 1) => void;
  disabled?: boolean;
}

/** An account in rotation, dragged by its handle to change who goes first. */
export function ClaudeSortableAccountRow({ id, onMove, disabled = false, ...row }: ClaudeSortableAccountRowProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled,
  });

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
    e.preventDefault();
    onMove(e.key === "ArrowUp" ? -1 : 1);
  };

  return (
    <div
      ref={setNodeRef}
      className={`relative bg-[var(--bg-secondary)] ${isDragging ? "z-10 shadow-lg" : ""}`}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <ClaudeAccountListRow
        {...row}
        handle={
          <button
            type="button"
            ref={setActivatorNodeRef}
            {...attributes}
            {...listeners}
            onKeyDown={onKeyDown}
            disabled={disabled}
            aria-label={`Reorder ${row.label}`}
            title={disabled ? undefined : "Drag to reorder"}
            className="flex h-6 w-4 shrink-0 cursor-grab touch-none items-center justify-center rounded text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)] active:cursor-grabbing disabled:cursor-default disabled:opacity-30"
          >
            <GripVertical size={14} />
          </button>
        }
      />
    </div>
  );
}

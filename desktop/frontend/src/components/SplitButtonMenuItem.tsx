import type { CSSProperties } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { ActionInfo } from "../types";
import { withEmoji } from "../withEmoji";

const itemClass =
  "flex w-full items-center gap-2.5 px-4 py-2 text-left text-[13px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]";

interface Props {
  child: ActionInfo;
  onSelect: (child: ActionInfo) => void;
}

export function SplitButtonMenuItem({ child, onSelect }: Props) {
  const { listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: child.name });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : undefined,
  };
  return (
    <button
      ref={setNodeRef}
      style={style}
      {...listeners}
      onClick={() => onSelect(child)}
      className={`${itemClass} cursor-grab`}
    >
      <span className="flex-1 truncate">{withEmoji(child.emoji, child.label)}</span>
    </button>
  );
}

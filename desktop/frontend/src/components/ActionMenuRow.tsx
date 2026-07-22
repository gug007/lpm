import { useCallback, type CSSProperties } from "react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import type { ActionInfo } from "../types";
import { withEmoji } from "../withEmoji";
import { actionTextColor } from "../actionColors";
import { MenuSplitRow } from "./MenuSplitRow";
import { useActionsActiveId, useMenuDrop } from "./ActionsDnd";

const leafClass =
  "flex w-full items-center gap-2.5 px-4 py-2 text-left text-[13px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]";

const insertionLine =
  "pointer-events-none absolute inset-x-2 z-10 h-0.5 rounded-full bg-[var(--accent-blue)]";

interface Props {
  child: ActionInfo;
  onRun: (child: ActionInfo) => void;
  onDrill: (child: ActionInfo) => void;
}

// Rows are stable: a combined draggable + droppable on the same node so the
// item can start a drag yet never shuffles (no sortable transform). The drag
// itself rides the surrounding DndContext; the DragOverlay follows the cursor
// while this source row ghosts in place.
export function ActionMenuRow({ child, onRun, onDrill }: Props) {
  const { listeners, setNodeRef: setDragRef } = useDraggable({ id: child.name });
  const { setNodeRef: setDropRef } = useDroppable({ id: child.name });
  const setNodeRef = useCallback(
    (node: HTMLElement | null) => {
      setDragRef(node);
      setDropRef(node);
    },
    [setDragRef, setDropRef],
  );

  const activeId = useActionsActiveId();
  const isDragging = activeId === child.name;
  const menuDrop = useMenuDrop();
  const mode = menuDrop?.target === child.name ? menuDrop.mode : null;

  const style: CSSProperties = { opacity: isDragging ? 0.4 : undefined };
  const label = withEmoji(child.emoji, child.label);
  const hasChildren = !!child.children?.length;

  let row;
  if (!hasChildren) {
    row = (
      <button onClick={() => onRun(child)} className={`${leafClass} cursor-grab`}>
        <span
          className="min-w-0 flex-1 truncate"
          style={{ color: actionTextColor(child.color) }}
        >
          {label}
        </span>
      </button>
    );
  } else if (child.cmd) {
    row = (
      <MenuSplitRow
        icon={null}
        label={label}
        onRun={() => onRun(child)}
        onConfigure={() => onDrill(child)}
      />
    );
  } else {
    row = (
      <MenuSplitRow
        icon={null}
        label={label}
        hasDefault={false}
        onRun={() => onDrill(child)}
        onConfigure={() => onDrill(child)}
      />
    );
  }

  return (
    <div ref={setNodeRef} style={style} {...listeners} className="relative cursor-grab">
      {row}
      {mode === "before" && <div className={`${insertionLine} top-0 -translate-y-1/2`} />}
      {mode === "after" && <div className={`${insertionLine} bottom-0 translate-y-1/2`} />}
      {mode === "nest" && (
        <div className="pointer-events-none absolute inset-0 rounded-lg bg-[var(--accent-blue)]/15 outline-2 -outline-offset-2 outline-dashed outline-[var(--accent-blue)]" />
      )}
    </div>
  );
}

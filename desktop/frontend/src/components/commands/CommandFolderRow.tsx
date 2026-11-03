import { useState, type ReactNode } from "react";
import { useDroppable } from "@dnd-kit/core";
import { ContextMenuShell } from "../ui/ContextMenuShell";
import { ContextMenuItem } from "../ui/ContextMenuItem";
import { CommandFolderInput } from "./CommandFolderInput";
import type { FolderKey } from "./commandsModel";

interface CommandFolderRowProps {
  folderKey: FolderKey;
  label: string;
  icon: ReactNode;
  count: number;
  selected: boolean;
  // Whether commands can be dropped here (every row but All commands).
  droppable: boolean;
  onSelect: () => void;
  // Given for a real folder: right-click offers renaming and removing it.
  onRename?: (name: string) => void;
  onDelete?: () => void;
}

// One row of the folders column: a place to look, and a place to drop a
// command to move it there.
export function CommandFolderRow({
  folderKey,
  label,
  icon,
  count,
  selected,
  droppable,
  onSelect,
  onRename,
  onDelete,
}: CommandFolderRowProps) {
  const { setNodeRef, isOver } = useDroppable({ id: `folder:${folderKey}`, data: { folderKey }, disabled: !droppable });
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [renaming, setRenaming] = useState(false);

  if (renaming && onRename) {
    return (
      <div className="px-1 py-0.5">
        <CommandFolderInput
          initial={label}
          onDone={(name) => {
            setRenaming(false);
            if (name) onRename(name);
          }}
        />
      </div>
    );
  }

  return (
    <>
      <button
        ref={setNodeRef}
        type="button"
        onClick={onSelect}
        onContextMenu={(e) => {
          if (!onRename && !onDelete) return;
          e.preventDefault();
          setMenu({ x: e.clientX, y: e.clientY });
        }}
        aria-current={selected ? "true" : undefined}
        className={`flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left text-[12.5px] transition-colors ${
          isOver
            ? "border-[var(--accent-cyan)] bg-[var(--accent-cyan)]/10 text-[var(--text-primary)]"
            : selected
              ? "border-transparent bg-[var(--bg-active)] text-[var(--text-primary)]"
              : "border-transparent text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
        }`}
      >
        <span className="shrink-0 text-[var(--text-muted)]">{icon}</span>
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <span className="shrink-0 text-[11px] tabular-nums text-[var(--text-muted)]">{count}</span>
      </button>
      {menu && (
        <ContextMenuShell x={menu.x} y={menu.y} onClose={() => setMenu(null)}>
          {onRename && (
            <ContextMenuItem
              label="Rename"
              onClick={() => {
                setMenu(null);
                setRenaming(true);
              }}
            />
          )}
          {onDelete && (
            <ContextMenuItem
              label="Delete folder"
              description="Its commands move to No folder"
              destructive
              onClick={() => {
                setMenu(null);
                onDelete();
              }}
            />
          )}
        </ContextMenuShell>
      )}
    </>
  );
}

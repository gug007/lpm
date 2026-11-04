import { useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import { ChevronDown, ChevronRight, FolderClosed, FolderOpen } from "lucide-react";
import { commandKey, type LpmCommand } from "../../lpmCommands";
import { ContextMenuItem } from "../ui/ContextMenuItem";
import { ContextMenuShell } from "../ui/ContextMenuShell";
import { CommandFolderInput } from "./CommandFolderInput";
import { CommandRow } from "./CommandRow";
import type { TreeFolder } from "./commandsModel";

interface CommandTreeFolderProps {
  folder: TreeFolder;
  open: boolean;
  selectedKey: string | null;
  running: ReadonlySet<string>;
  onToggle: () => void;
  onSelect: (c: LpmCommand) => void;
  onNew: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
}

// A folder in the Commands tree: its row, which opens and closes it, and its
// commands below. A command dropped anywhere on it moves in; right-click
// offers a new command here, renaming and removing it.
export function CommandTreeFolder({
  folder,
  open,
  selectedKey,
  running,
  onToggle,
  onSelect,
  onNew,
  onRename,
  onDelete,
}: CommandTreeFolderProps) {
  const { setNodeRef, isOver } = useDroppable({ id: `folder:${folder.key}`, data: { folderKey: folder.key } });
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [renaming, setRenaming] = useState(false);
  const Chevron = open ? ChevronDown : ChevronRight;
  const Icon = open ? FolderOpen : FolderClosed;

  const pick = (action: () => void) => () => {
    setMenu(null);
    action();
  };

  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col gap-px rounded-md border transition-colors ${
        isOver ? "border-[var(--accent-cyan)] bg-[var(--accent-cyan)]/10" : "border-transparent"
      }`}
    >
      {renaming ? (
        <div className="px-1 py-0.5">
          <CommandFolderInput
            initial={folder.name}
            onDone={(name) => {
              setRenaming(false);
              if (name) onRename(name);
            }}
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={onToggle}
          onContextMenu={(e) => {
            e.preventDefault();
            setMenu({ x: e.clientX, y: e.clientY });
          }}
          aria-expanded={open}
          className="flex w-full items-center gap-1.5 rounded-md px-1.5 py-1.5 text-left text-[12.5px] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
        >
          <Chevron size={12} className="shrink-0 text-[var(--text-muted)]" />
          <Icon size={13} className="shrink-0 text-[var(--text-muted)]" />
          <span className="min-w-0 flex-1 truncate">{folder.name}</span>
          <span className="shrink-0 text-[11px] tabular-nums text-[var(--text-muted)]">{folder.commands.length}</span>
        </button>
      )}
      {open &&
        folder.commands.map((c) => (
          <CommandRow
            key={commandKey(c)}
            command={c}
            nested
            selected={selectedKey === commandKey(c)}
            runs={running.has(commandKey(c))}
            onSelect={() => onSelect(c)}
          />
        ))}
      {menu && (
        <ContextMenuShell x={menu.x} y={menu.y} onClose={() => setMenu(null)}>
          <ContextMenuItem label="New skill here" onClick={pick(onNew)} />
          <ContextMenuItem label="Rename" onClick={pick(() => setRenaming(true))} />
          <ContextMenuItem
            label="Delete folder"
            description="Its skills move to the top level"
            destructive
            onClick={pick(onDelete)}
          />
        </ContextMenuShell>
      )}
    </div>
  );
}

import { useState } from "react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { ChevronDown, ChevronRight, FolderClosed, FolderOpen } from "lucide-react";
import { commandKey, type CommandScope } from "../../lpmCommands";
import { ContextMenuItem } from "../ui/ContextMenuItem";
import { ContextMenuShell } from "../ui/ContextMenuShell";
import { childFolder, folderIndent, folderParent } from "./commandFolders";
import { CommandFolderInput } from "./CommandFolderInput";
import { CommandOtherRow } from "./CommandOtherRow";
import { CommandRow } from "./CommandRow";
import { otherKey, type FolderRowActions, type SkillRowActions, type TreeFolder } from "./commandsModel";

interface CommandTreeFolderProps {
  folder: TreeFolder;
  scope: CommandScope;
  actions: SkillRowActions;
  folderActions: FolderRowActions;
  selectedKey: string | null;
  running: ReadonlySet<string>;
}

// A folder in the Skills tree: its row, which opens and closes it, then the
// folders inside it and its skills. A skill or folder dropped anywhere on it moves
// in, and the row drags to move the folder with all it holds; right-click offers
// a new skill or folder here, renaming and removing it.
export function CommandTreeFolder({
  folder,
  scope,
  actions,
  folderActions,
  selectedKey,
  running,
}: CommandTreeFolderProps) {
  const { setNodeRef, isOver } = useDroppable({ id: `folder:${folder.key}`, data: { folderKey: folder.key } });
  const drag = useDraggable({
    id: `drag-folder:${folder.key}`,
    data: { folder: { scope, name: folder.name } },
  });
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [adding, setAdding] = useState(false);
  const open = folderActions.isOpen(folder.key);
  const Chevron = open ? ChevronDown : ChevronRight;
  const Icon = open ? FolderOpen : FolderClosed;
  const skillDepth = folder.depth + 1;

  const pick = (action: () => void) => () => {
    setMenu(null);
    action();
  };

  const addFolder = (name: string | null) => {
    setAdding(false);
    if (!name) return;
    folderActions.onCreateFolder(childFolder(folder.name, name));
    if (!open) folderActions.onToggle(folder.key);
  };

  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col gap-px rounded-md border transition-colors ${
        isOver ? "border-[var(--accent-cyan)] bg-[var(--accent-cyan)]/10" : "border-transparent"
      }`}
    >
      {renaming ? (
        <div className="py-0.5 pr-1" style={{ paddingLeft: folderIndent(folder.depth) }}>
          <CommandFolderInput
            initial={folder.label}
            onDone={(name) => {
              setRenaming(false);
              if (name) folderActions.onRenameFolder(folder.name, childFolder(folderParent(folder.name), name));
            }}
          />
        </div>
      ) : (
        <button
          ref={drag.setNodeRef}
          type="button"
          {...drag.attributes}
          {...drag.listeners}
          onClick={() => folderActions.onToggle(folder.key)}
          onContextMenu={(e) => {
            e.preventDefault();
            setMenu({ x: e.clientX, y: e.clientY });
          }}
          aria-expanded={open}
          title={folder.name}
          style={{ paddingLeft: folderIndent(folder.depth) }}
          className={`flex w-full items-center gap-1.5 rounded-md py-1.5 pr-1.5 text-left text-[12.5px] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] ${
            drag.isDragging ? "opacity-40" : ""
          }`}
        >
          <Chevron size={12} className="shrink-0 text-[var(--text-muted)]" />
          <Icon size={13} className="shrink-0 text-[var(--text-muted)]" />
          <span className="min-w-0 flex-1 truncate">{folder.label}</span>
          <span className="shrink-0 text-[11px] tabular-nums text-[var(--text-muted)]">{folder.total}</span>
        </button>
      )}
      {adding && (
        <div className="py-0.5 pr-1" style={{ paddingLeft: folderIndent(skillDepth) }}>
          <CommandFolderInput onDone={addFolder} />
        </div>
      )}
      {open &&
        folder.children.map((child) => (
          <CommandTreeFolder
            key={child.key}
            folder={child}
            scope={scope}
            actions={actions}
            folderActions={folderActions}
            selectedKey={selectedKey}
            running={running}
          />
        ))}
      {open &&
        folder.commands.map((c) => (
          <CommandRow
            key={commandKey(c)}
            command={c}
            depth={skillDepth}
            selected={selectedKey === commandKey(c)}
            runs={running.has(commandKey(c))}
            onSelect={() => folderActions.onSelect(c)}
            onConvert={() => actions.onConvert(scope, c.name, false)}
          />
        ))}
      {open &&
        folder.others.map((skill) => (
          <CommandOtherRow
            key={skill.name}
            scope={scope}
            skill={skill}
            depth={skillDepth}
            selected={selectedKey === otherKey(scope, skill.name)}
            actions={actions}
          />
        ))}
      {menu && (
        <ContextMenuShell x={menu.x} y={menu.y} onClose={() => setMenu(null)}>
          <ContextMenuItem
            label="New skill here"
            onClick={pick(() => folderActions.onNew({ scope, folder: folder.name }))}
          />
          <ContextMenuItem label="New folder here" onClick={pick(() => setAdding(true))} />
          <ContextMenuItem label="Rename" onClick={pick(() => setRenaming(true))} />
          <ContextMenuItem
            label="Delete folder"
            description="What's inside moves up a level"
            destructive
            onClick={pick(() => folderActions.onDeleteFolder(folder.name))}
          />
        </ContextMenuShell>
      )}
    </div>
  );
}

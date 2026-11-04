import { useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import { FolderGit2, FolderPlus, Globe } from "lucide-react";
import { commandKey, type LpmCommand } from "../../lpmCommands";
import { folderKey, type FolderKey } from "./commandFolders";
import { CommandFolderInput } from "./CommandFolderInput";
import { CommandOtherFolder } from "./CommandOtherFolder";
import { CommandOtherRow } from "./CommandOtherRow";
import { CommandRow } from "./CommandRow";
import { CommandTreeFolder } from "./CommandTreeFolder";
import {
  otherKey,
  scopeTitle,
  type CommandPlace,
  type FolderRowActions,
  type SkillRowActions,
  type TreeScope,
} from "./commandsModel";

interface CommandTreeScopeProps {
  node: TreeScope;
  projectLabel: string;
  selectedKey: string | null;
  running: ReadonlySet<string>;
  collapsed: ReadonlySet<FolderKey>;
  searching: boolean;
  othersOpen: boolean;
  onToggle: (key: FolderKey) => void;
  onToggleOthers: () => void;
  onSelect: (c: LpmCommand) => void;
  actions: SkillRowActions;
  onNew: (where: CommandPlace) => void;
  onCreateFolder: (name: string) => void;
  onRenameFolder: (name: string, newName: string) => void;
  onDeleteFolder: (name: string) => void;
}

// One list in the Skills tree (this project's or the global one): its heading,
// its folders, the skills in no folder, then the skills not made in lpm. A skill
// dropped on the heading or among those loose skills leaves its folder, and one
// not made in lpm stays there, among them.
export function CommandTreeScope({
  node,
  projectLabel,
  selectedKey,
  running,
  collapsed,
  searching,
  othersOpen,
  onToggle,
  onToggleOthers,
  onSelect,
  actions,
  onNew,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
}: CommandTreeScopeProps) {
  const [adding, setAdding] = useState(false);
  // A drop here takes a skill out of its folder.
  const rootKey = folderKey(node.scope, null);
  const heading = useDroppable({ id: `root:${rootKey}`, data: { folderKey: rootKey } });
  const loose = useDroppable({ id: `loose:${rootKey}`, data: { folderKey: rootKey } });
  const overRoot = heading.isOver || loose.isOver;
  const title = scopeTitle(node.scope, projectLabel);
  const folderActions: FolderRowActions = {
    isOpen: (key) => searching || !collapsed.has(key),
    onToggle,
    onSelect,
    onNew,
    onCreateFolder,
    onRenameFolder,
    onDeleteFolder,
  };
  const empty =
    !searching && !adding && node.folders.length === 0 && node.loose.length + node.rootOthers.length === 0;

  return (
    <section className="flex flex-col gap-px" aria-label={title}>
      <div
        ref={heading.setNodeRef}
        title={title}
        className={`mb-0.5 flex items-center gap-1.5 rounded-md border px-2 py-1 text-[10.5px] font-medium uppercase tracking-wider text-[var(--text-muted)] transition-colors ${
          overRoot ? "border-[var(--accent-cyan)] bg-[var(--accent-cyan)]/10" : "border-transparent"
        }`}
      >
        {node.scope === "project" ? <FolderGit2 size={12} /> : <Globe size={12} />}
        <span className="min-w-0 flex-1 truncate">{node.scope === "project" ? "This project" : "Global"}</span>
        <span className="tabular-nums">{node.count}</span>
        <button
          type="button"
          onClick={() => setAdding(true)}
          title="New folder"
          aria-label={`New folder in ${title}`}
          className="grid h-5 w-5 place-items-center rounded text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
        >
          <FolderPlus size={13} />
        </button>
      </div>
      {node.folders.map((f) => (
        <CommandTreeFolder
          key={f.key}
          folder={f}
          scope={node.scope}
          actions={actions}
          folderActions={folderActions}
          selectedKey={selectedKey}
          running={running}
        />
      ))}
      {adding && (
        <div className="px-1 py-0.5">
          <CommandFolderInput
            onDone={(name) => {
              setAdding(false);
              if (name) onCreateFolder(name);
            }}
          />
        </div>
      )}
      <div ref={loose.setNodeRef} className="flex flex-col gap-px">
        {node.loose.map((c) => (
          <CommandRow
            key={commandKey(c)}
            command={c}
            depth={0}
            selected={selectedKey === commandKey(c)}
            runs={running.has(commandKey(c))}
            onSelect={() => onSelect(c)}
          />
        ))}
        {node.rootOthers.map((skill) => (
          <CommandOtherRow
            key={skill.name}
            scope={node.scope}
            skill={skill}
            depth={0}
            selected={selectedKey === otherKey(node.scope, skill.name)}
            actions={actions}
          />
        ))}
      </div>
      {empty && <p className="px-2 py-1 text-[11.5px] text-[var(--text-muted)]">No skills yet.</p>}
      {node.others.length > 0 && (
        <CommandOtherFolder
          scope={node.scope}
          skills={node.others}
          open={searching || othersOpen}
          selectedKey={selectedKey}
          actions={actions}
          onToggle={onToggleOthers}
        />
      )}
    </section>
  );
}

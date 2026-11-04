import { useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import type { CommandScope, LpmCommand, LpmCommandLists } from "../../lpmCommands";
import { CommandTreeScope } from "./CommandTreeScope";
import { commandTree, runningKeys, type CommandPlace, type FolderKey, type SkillRowActions } from "./commandsModel";

interface CommandTreeProps {
  lists: LpmCommandLists;
  projectLabel: string;
  query: string;
  selectedKey: string | null;
  onQuery: (q: string) => void;
  onSelect: (c: LpmCommand) => void;
  actions: SkillRowActions;
  // A new command: in `where`, or where the open one is when null.
  onNew: (where: CommandPlace | null) => void;
  onCreateFolder: (scope: CommandScope, name: string) => void;
  onRenameFolder: (scope: CommandScope, name: string, newName: string) => void;
  onDeleteFolder: (scope: CommandScope, name: string) => void;
}

// The left column of the Commands tab: search and New, then this project's
// commands and the global ones as one tree of folders and commands.
export function CommandTree({
  lists,
  projectLabel,
  query,
  selectedKey,
  onQuery,
  onSelect,
  actions,
  onNew,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
}: CommandTreeProps) {
  const tree = useMemo(() => commandTree(lists, query), [lists, query]);
  const running = useMemo(() => runningKeys(lists), [lists]);
  const [collapsed, setCollapsed] = useState<ReadonlySet<FolderKey>>(() => new Set());
  // The lists whose other skills are showing; they start closed, unlike folders.
  const [othersOpen, setOthersOpen] = useState<ReadonlySet<CommandScope>>(() => new Set());
  const searching = query.trim() !== "";

  const toggle = (key: FolderKey) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (!next.delete(key)) next.add(key);
      return next;
    });

  const toggleOthers = (scope: CommandScope) =>
    setOthersOpen((prev) => {
      const next = new Set(prev);
      if (!next.delete(scope)) next.add(scope);
      return next;
    });

  return (
    <div className="flex min-h-0 flex-col border-r border-[var(--border)]">
      <div className="flex shrink-0 items-center gap-2 px-3 pb-2 pt-3">
        <label className="flex min-w-0 flex-1 items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--bg-secondary)] px-2 py-1 text-[var(--text-muted)] focus-within:border-[var(--accent-cyan)]">
          <Search size={12} />
          <input
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder="Search skills"
            aria-label="Search skills"
            className="min-w-0 flex-1 bg-transparent text-[12.5px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
          />
        </label>
        <button
          type="button"
          onClick={() => onNew(null)}
          className="flex shrink-0 items-center gap-1 rounded-md bg-[var(--accent-cyan)] px-2.5 py-1 text-[11.5px] font-semibold text-[var(--bg-primary)] hover:brightness-110"
        >
          <Plus size={12} strokeWidth={2.5} />
          New
        </button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-2 pb-3">
        {lists.projectError && (
          <p className="mx-1 rounded-md bg-[var(--accent-amber)]/10 px-2 py-1.5 text-[11px] leading-snug text-[var(--accent-amber-text)]">
            Couldn't read this project's commands: {lists.projectError}
          </p>
        )}
        {tree.length === 0 ? (
          <p className="px-2 py-6 text-center text-[12px] text-[var(--text-muted)]">No skills match.</p>
        ) : (
          tree.map((node) => (
            <CommandTreeScope
              key={node.scope}
              node={node}
              projectLabel={projectLabel}
              selectedKey={selectedKey}
              running={running}
              collapsed={collapsed}
              searching={searching}
              othersOpen={othersOpen.has(node.scope)}
              onToggle={toggle}
              onToggleOthers={() => toggleOthers(node.scope)}
              onSelect={onSelect}
              actions={actions}
              onNew={onNew}
              onCreateFolder={(name) => onCreateFolder(node.scope, name)}
              onRenameFolder={(name, newName) => onRenameFolder(node.scope, name, newName)}
              onDeleteFolder={(name) => onDeleteFolder(node.scope, name)}
            />
          ))
        )}
      </div>
    </div>
  );
}

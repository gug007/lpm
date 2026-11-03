import { useMemo, useState } from "react";
import { FolderClosed, FolderGit2, FolderPlus, Globe, Inbox, Layers, Plus } from "lucide-react";
import { scopeList, type CommandScope, type LpmCommandLists } from "../../lpmCommands";
import { CommandFolderInput } from "./CommandFolderInput";
import { CommandFolderRow } from "./CommandFolderRow";
import { ALL_FOLDERS, folderCounts, folderKey, scopeTitle, scopesOf, type FolderKey } from "./commandsModel";

interface CommandFolderColumnProps {
  lists: LpmCommandLists;
  projectLabel: string;
  selected: FolderKey;
  onSelect: (key: FolderKey) => void;
  onCreate: (scope: CommandScope, name: string) => void;
  onRename: (scope: CommandScope, name: string, newName: string) => void;
  onDelete: (scope: CommandScope, name: string) => void;
}

// The left column of the Commands tab: everything, then this project's list
// and the global one, each with its folders, its loose commands and a way to
// add a folder.
export function CommandFolderColumn({
  lists,
  projectLabel,
  selected,
  onSelect,
  onCreate,
  onRename,
  onDelete,
}: CommandFolderColumnProps) {
  const [adding, setAdding] = useState<CommandScope | null>(null);
  const counts = useMemo(() => folderCounts(lists), [lists]);
  const count = (key: FolderKey) => counts.get(key) ?? 0;

  return (
    <div className="flex min-h-0 flex-col gap-0.5 overflow-y-auto px-2 pb-3">
      <CommandFolderRow
        folderKey={ALL_FOLDERS}
        label="All commands"
        icon={<Layers size={13} />}
        count={count(ALL_FOLDERS)}
        selected={selected === ALL_FOLDERS}
        droppable={false}
        onSelect={() => onSelect(ALL_FOLDERS)}
      />
      {lists.projectError && (
        <p className="mx-1 mt-2 rounded-md bg-[var(--accent-amber)]/10 px-2 py-1.5 text-[11px] leading-snug text-[var(--accent-amber-text)]">
          Couldn't read this project's commands: {lists.projectError}
        </p>
      )}
      {scopesOf(lists).map((scope) => {
        const list = scopeList(lists, scope)!;
        const looseKey = folderKey(scope, null);
        return (
          <section key={scope} className="mt-3 flex flex-col gap-0.5" aria-label={scopeTitle(scope, projectLabel)}>
            <div className="flex items-center gap-1.5 px-2 pb-1 text-[10.5px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
              {scope === "project" ? <FolderGit2 size={12} /> : <Globe size={12} />}
              <span className="min-w-0 flex-1 truncate">{scope === "project" ? "This project" : "Global"}</span>
              <button
                type="button"
                onClick={() => setAdding(scope)}
                title="New folder"
                aria-label={`New folder in ${scopeTitle(scope, projectLabel)}`}
                className="grid h-5 w-5 place-items-center rounded text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
              >
                <FolderPlus size={13} />
              </button>
            </div>
            {list.folders.map((folder) => {
              const key = folderKey(scope, folder);
              return (
                <CommandFolderRow
                  key={key}
                  folderKey={key}
                  label={folder}
                  icon={<FolderClosed size={13} />}
                  count={count(key)}
                  selected={selected === key}
                  droppable
                  onSelect={() => onSelect(key)}
                  onRename={(name) => onRename(scope, folder, name)}
                  onDelete={() => onDelete(scope, folder)}
                />
              );
            })}
            <CommandFolderRow
              folderKey={looseKey}
              label="No folder"
              icon={<Inbox size={13} />}
              count={count(looseKey)}
              selected={selected === looseKey}
              droppable
              onSelect={() => onSelect(looseKey)}
            />
            {adding === scope ? (
              <div className="px-1 py-0.5">
                <CommandFolderInput
                  onDone={(name) => {
                    setAdding(null);
                    if (name) onCreate(scope, name);
                  }}
                />
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setAdding(scope)}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px] text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
              >
                <Plus size={13} />
                New folder
              </button>
            )}
          </section>
        );
      })}
    </div>
  );
}

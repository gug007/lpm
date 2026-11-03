import { useMemo } from "react";
import { Plus, Search } from "lucide-react";
import { commandKey, type LpmCommand, type LpmCommandLists } from "../../lpmCommands";
import { CommandRow } from "./CommandRow";
import { ALL_FOLDERS, folderTitle, runningKeys, visibleCommands, type FolderKey } from "./commandsModel";

interface CommandListProps {
  lists: LpmCommandLists;
  folder: FolderKey;
  projectLabel: string;
  query: string;
  selectedKey: string | null;
  onQuery: (q: string) => void;
  onSelect: (c: LpmCommand) => void;
  onNew: () => void;
}

// The middle column of the Commands tab: the commands in the picked folder.
export function CommandList({
  lists,
  folder,
  projectLabel,
  query,
  selectedKey,
  onQuery,
  onSelect,
  onNew,
}: CommandListProps) {
  const commands = useMemo(() => visibleCommands(lists, folder, query), [lists, folder, query]);
  const running = useMemo(() => runningKeys(lists), [lists]);
  return (
    <div className="flex min-h-0 flex-col border-r border-[var(--border)]">
      <div className="flex shrink-0 items-center gap-2 px-3 pb-2 pt-3">
        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-[var(--text-primary)]">
          {folderTitle(folder, projectLabel)}
        </span>
        <button
          type="button"
          onClick={onNew}
          className="flex items-center gap-1 rounded-md bg-[var(--accent-cyan)] px-2.5 py-1 text-[11.5px] font-semibold text-[var(--bg-primary)] hover:brightness-110"
        >
          <Plus size={12} strokeWidth={2.5} />
          New
        </button>
      </div>
      <label className="mx-3 mb-2 flex shrink-0 items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--bg-secondary)] px-2 py-1 text-[var(--text-muted)] focus-within:border-[var(--accent-cyan)]">
        <Search size={12} />
        <input
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="Search commands"
          aria-label="Search commands"
          className="min-w-0 flex-1 bg-transparent text-[12.5px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
        />
      </label>
      <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-2 pb-3">
        {commands.length === 0 ? (
          <p className="px-2 py-6 text-center text-[12px] leading-snug text-[var(--text-muted)]">
            {query ? "No commands match." : "Nothing here yet. Press New, or drag a command onto this folder."}
          </p>
        ) : (
          commands.map((c) => (
            <CommandRow
              key={commandKey(c)}
              command={c}
              selected={selectedKey === commandKey(c)}
              showPlace={folder === ALL_FOLDERS}
              runs={running.has(commandKey(c))}
              onSelect={() => onSelect(c)}
            />
          ))
        )}
      </div>
    </div>
  );
}

import { useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { Plus, Search } from "lucide-react";
import { allCommands, commandKey, type CommandScope, type LpmCommand, type LpmCommandLists } from "../../lpmCommands";
import { useEventListener } from "../../hooks/useEventListener";
import { chordLabel, matchesChord, type Chord } from "../../keys";
import { isMac } from "../../platform";
import { blockingDialogOpen } from "../ui/blockingDialog";
import { setSkillFold, useSkillFolds } from "../../store/skillFolds";
import { CommandTreeScope } from "./CommandTreeScope";
import { commandTree, runningKeys, type CommandPlace, type SkillRowActions } from "./commandsModel";
import { SkillBulkBar } from "./SkillBulkBar";
import { SkillSortButton } from "./SkillSortButton";
import { SkillTreeContext, type SkillMenuActions, type SkillTreeState } from "./skillTreeContext";
import type { SkillSort } from "./skillUsage";

interface CommandTreeProps {
  lists: LpmCommandLists;
  projectName: string;
  projectLabel: string;
  query: string;
  selectedKey: string | null;
  // The tab is showing, so what another window or computer folds should show too.
  visible: boolean;
  // The tab is the one in view in the focused pane, so ⌘F is its own.
  focused: boolean;
  sort: SkillSort;
  picked: ReadonlySet<string>;
  unsavedKey: string | null;
  menu: SkillMenuActions;
  onQuery: (q: string) => void;
  onSort: (sort: SkillSort) => void;
  onPicked: (picked: ReadonlySet<string>) => void;
  onSelect: (c: LpmCommand) => void;
  actions: SkillRowActions;
  // A new command: in `where`, or where the open one is when null.
  onNew: (where: CommandPlace | null) => void;
  onCreateFolder: (scope: CommandScope, name: string) => void;
  onRenameFolder: (scope: CommandScope, name: string, newName: string) => void;
  onDeleteFolder: (scope: CommandScope, name: string) => void;
}

const FIND: Chord = { key: "f", meta: true };
const NO_PICKS: ReadonlySet<string> = new Set();

const insideMonaco = (target: EventTarget | null) =>
  target instanceof Element && target.closest(".monaco-editor") !== null;

// The left column of the Skills tab: search, sort and New, then this project's
// skills and the global ones as one tree of folders and skills. The search
// field drives the list: ↑ ↓ move through what it found and ↵ opens it.
export function CommandTree({
  lists,
  projectName,
  projectLabel,
  query,
  selectedKey,
  visible,
  focused,
  sort,
  picked,
  unsavedKey,
  menu,
  onQuery,
  onSort,
  onPicked,
  onSelect,
  actions,
  onNew,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
}: CommandTreeProps) {
  const tree = useMemo(() => commandTree(lists, query, sort), [lists, query, sort]);
  const running = useMemo(() => runningKeys(lists), [lists]);
  const folds = useSkillFolds(projectName, visible);
  const [cursor, setCursor] = useState<string | null>(null);
  const [searchFocused, setSearchFocused] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const anchor = useRef<string | null>(null);
  const searching = query.trim() !== "";
  const matched = tree.reduce((n, s) => n + s.matched, 0);

  // The rows as the list shows them, top to bottom.
  const rows = () => [...(listRef.current?.querySelectorAll<HTMLElement>("[data-skill-row]") ?? [])];
  const rowKey = (el: HTMLElement) => el.dataset.skillRow ?? "";

  // A new search starts on its first result, so ↵ opens it.
  useLayoutEffect(() => {
    const first = searching ? listRef.current?.querySelector<HTMLElement>("[data-skill-row]") : null;
    setCursor(first ? rowKey(first) : null);
  }, [searching, tree]);

  useEventListener(
    "keydown",
    (e) => {
      if (!matchesChord(e, FIND) || blockingDialogOpen() || insideMonaco(e.target)) return;
      e.preventDefault();
      e.stopPropagation();
      searchRef.current?.focus();
      searchRef.current?.select();
    },
    window,
    focused,
    true,
  );

  const moveCursor = (step: 1 | -1) => {
    const all = rows();
    if (all.length === 0) return;
    const at = all.findIndex((el) => rowKey(el) === cursor);
    const next = at < 0 ? (step > 0 ? 0 : all.length - 1) : Math.max(0, Math.min(all.length - 1, at + step));
    setCursor(rowKey(all[next]));
    all[next].scrollIntoView?.({ block: "nearest" });
  };

  const onSearchKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      moveCursor(e.key === "ArrowDown" ? 1 : -1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      rows()
        .find((el) => rowKey(el) === cursor)
        ?.click();
    } else if (e.key === "Escape") {
      e.preventDefault();
      if (query) onQuery("");
      else searchRef.current?.blur();
    }
  };

  // ↑ and ↓ step between rows that have the keyboard; Esc lets go of the picks.
  const onListKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape" && picked.size > 0) {
      e.preventDefault();
      onPicked(NO_PICKS);
      return;
    }
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const all = rows();
    const at = all.indexOf(e.target as HTMLElement);
    if (at < 0) return;
    e.preventDefault();
    all[Math.max(0, Math.min(all.length - 1, at + (e.key === "ArrowDown" ? 1 : -1)))].focus();
  };

  const pick = (c: LpmCommand, e: MouseEvent): boolean => {
    const key = commandKey(c);
    const lpmKeys = rows()
      .filter((el) => el.dataset.lpmSkill !== undefined)
      .map(rowKey);
    const open = selectedKey && lpmKeys.includes(selectedKey) ? selectedKey : null;
    if (e.shiftKey) {
      const from = lpmKeys.indexOf(anchor.current ?? open ?? key);
      const to = lpmKeys.indexOf(key);
      if (from < 0 || to < 0) return false;
      onPicked(new Set(lpmKeys.slice(Math.min(from, to), Math.max(from, to) + 1)));
      return true;
    }
    anchor.current = key;
    if (isMac ? e.metaKey : e.ctrlKey) {
      const next = new Set(picked.size === 0 && open && open !== key ? [open] : picked);
      if (!next.delete(key)) next.add(key);
      onPicked(next);
      return true;
    }
    if (picked.size > 0) onPicked(NO_PICKS);
    return false;
  };

  const state: SkillTreeState = {
    query,
    now: Date.now(),
    cursorKey: searchFocused ? cursor : null,
    picked,
    pickedSkills: picked.size ? allCommands(lists).filter((c) => picked.has(commandKey(c))) : [],
    unsavedKey,
    pick,
    clearPicks: () => onPicked(NO_PICKS),
    menu,
  };

  return (
    <SkillTreeContext.Provider value={state}>
      <div className="flex min-h-0 flex-col border-r border-[var(--border)]">
        <div className="flex shrink-0 items-center gap-2 px-3 pb-2 pt-3">
          <label className="flex min-w-0 flex-1 items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--bg-secondary)] px-2 py-1 text-[var(--text-muted)] focus-within:border-[var(--accent-cyan)]">
            <Search size={12} className="shrink-0" />
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => onQuery(e.target.value)}
              onKeyDown={onSearchKey}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              placeholder="Search skills"
              aria-label="Search skills"
              title={`Search skills (${chordLabel(FIND)})`}
              className="min-w-0 flex-1 bg-transparent text-[12.5px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
            />
            {searching && (
              <span className="shrink-0 text-[11px] tabular-nums" aria-live="polite">
                {matched} {matched === 1 ? "skill" : "skills"}
              </span>
            )}
          </label>
          <SkillSortButton sort={sort} onSort={onSort} />
          <button
            type="button"
            onClick={() => onNew(null)}
            className="flex shrink-0 items-center gap-1 rounded-md bg-[var(--accent-cyan)] px-2.5 py-1 text-[11.5px] font-semibold text-[var(--bg-primary)] hover:brightness-110"
          >
            <Plus size={12} strokeWidth={2.5} />
            New
          </button>
        </div>
        <div
          ref={listRef}
          onKeyDown={onListKey}
          className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-2 pb-3"
        >
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
                folds={folds[node.scope]}
                searching={searching}
                onFold={(folder, open) => setSkillFold(projectName, node.scope, folder, open)}
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
        <SkillBulkBar />
      </div>
    </SkillTreeContext.Provider>
  );
}

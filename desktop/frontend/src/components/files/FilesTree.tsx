import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import type { CheckState } from "../ChangedFilesTree";
import { matchesChord } from "../../keys";
import { TRASH_CHORD } from "./fileActions";
import { FilesAllChangesRow } from "./FilesAllChangesRow";
import { FilesFilterBox } from "./FilesFilterBox";
import { FilesNote } from "./FilesNote";
import { FILES_ROW_PX, type RowTarget } from "./FilesRow";
import { FilesRows } from "./FilesRows";
import type { IndexEntry } from "./filesFilter";
import { createTreeCursorStore } from "./treeCursor";
import { firstRow, type FolderList } from "./typedFolder";
import type { EnterOptions } from "./useTypedPathRow";
import { isUnder, withDraftRow, withoutPending } from "./treeEdits";
import { useVirtualList } from "./useVirtualList";
import { buildMatchTree, parentPath, type Item, type Listing, type TreeRow } from "./treeModel";
import type { Changes } from "./useChangedFiles";
import type { TreeEdits } from "./useTreeEdits";

export interface CursorRequest {
  path: string;
  seq: number;
}

export interface ActivateOptions {
  // Enter opens a file and moves on to editing it; Space and a click keep the
  // tree, so a browse stays a browse.
  focusEditor?: boolean;
}

const NO_ROWS: TreeRow[] = [];
const NO_PATHS: readonly string[] = [];
const NO_MENU = () => {};

interface FilesTreeProps {
  rows: TreeRow[];
  rootListing: Listing | undefined;
  // The working tree's git status: `decorations` marks every row with it,
  // and with `changesOnly` it is all the rail shows.
  changes: Changes;
  decorations: ReadonlyMap<string, string>;
  // Every listed path git ignores; its rows grey out.
  ignoredPaths: ReadonlySet<string>;
  changesOnly: boolean;
  // The whole working tree as one diff stack, in place of a single file.
  allChanges: boolean;
  onAllChangesChange: (on: boolean) => void;
  selectedPath: string | null;
  dirtyPaths: ReadonlySet<string>;
  query: string;
  onQueryChange: (query: string) => void;
  // null while the index is still being built.
  results: IndexEntry[] | null;
  // How many paths matched in all; `results` holds the best of them.
  resultsTotal?: number;
  // Shown in place of the list when nothing matches the filter.
  noMatches?: ReactNode;
  // A path typed in the filter box, as a row of its own above the matches.
  pathRow?: ReactNode;
  // Takes Enter in the filter box when it returns true.
  onEnter?: (opts: EnterOptions) => boolean;
  // A folder outside the project, listed in place of the matches.
  folder?: FolderList | null;
  cursorRequest: CursorRequest | null;
  // Bumped to put the caret in the filter box with its text selected.
  filterFocusRequest: number;
  onActivate: (item: Item, opts?: ActivateOptions) => void;
  onToggleDir: (path: string) => void;
  onRowMenu: (target: RowTarget) => void;
  // Absent where nothing listed can be discarded.
  onDiscard?: (item: Item) => void;
  // Commit checkboxes on the rows, keyed by path, for picking what to commit.
  checks?: ReadonlyMap<string, CheckState>;
  onCheck?: (item: Item, select: boolean) => void;
  // The row the keyboard cursor sits on while the list has focus, else null:
  // the target of the path chords when they fire from the tree.
  onCursorChange?: (item: Item | null) => void;
  // New entries, renames and Move to Trash; without it the tree is read-only.
  edits?: TreeEdits;
}

// The rail: a filter box over the folder tree, or, while a filter is typed,
// over the matches shown under their folders. One keyboard cursor serves both.
export function FilesTree({
  rows,
  rootListing,
  changes,
  decorations,
  ignoredPaths,
  changesOnly,
  allChanges,
  onAllChangesChange,
  selectedPath,
  dirtyPaths,
  query,
  onQueryChange,
  results,
  resultsTotal = 0,
  noMatches,
  pathRow,
  onEnter,
  folder = null,
  cursorRequest,
  filterFocusRequest,
  onActivate,
  onToggleDir,
  onRowMenu,
  onDiscard,
  checks,
  onCheck,
  onCursorChange,
  edits,
}: FilesTreeProps) {
  const filtering = query.trim() !== "";
  const matchRows = useMemo(() => (results ? buildMatchTree(results) : NO_ROWS), [results]);
  const edit = edits?.edit ?? null;
  const pending = edits?.pending ?? NO_PATHS;
  const outside = filtering ? folder : null;
  const items: TreeRow[] = useMemo(
    () => outside?.rows ?? withoutPending(withDraftRow(filtering ? matchRows : rows, edit), pending),
    [outside, filtering, matchRows, rows, edit, pending],
  );
  const [cursorStore] = useState(createTreeCursorStore);
  const setCursorPath = useCallback(
    (cursorPath: string | null) => cursorStore.setState({ cursorPath }),
    [cursorStore],
  );
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const virtual = useVirtualList(listRef, items.length, FILES_ROW_PX);
  const { ensureVisible } = virtual;

  // Keyboard travel starts from the open file.
  useEffect(() => {
    cursorStore.setState(selectedPath ? { selectedPath, cursorPath: selectedPath } : { selectedPath });
  }, [selectedPath, cursorStore]);

  // The selected row, and the cursor while the list has focus, stay in view.
  // A selection is revealed once per list, as soon as its row is there: the
  // same list refreshing leaves the rail where the user scrolled it.
  const listKind = filtering ? "matches" : changesOnly ? "changes" : "files";
  const revealedRef = useRef<string | null>(null);
  useEffect(() => {
    const indexOf = (path: string | null) => (path ? items.findIndex((it) => it.path === path) : -1);
    const reveal = (path: string | null) => {
      revealedRef.current = ensureVisible(indexOf(path)) ? `${listKind}:${path}` : null;
    };
    const { selectedPath } = cursorStore.getState();
    if (revealedRef.current !== `${listKind}:${selectedPath}`) reveal(selectedPath);
    return cursorStore.subscribe((s, prev) => {
      if (s.selectedPath !== prev.selectedPath) reveal(s.selectedPath);
      if (s.listFocused && s.cursorPath !== prev.cursorPath) ensureVisible(indexOf(s.cursorPath));
    });
  }, [items, listKind, cursorStore, ensureVisible]);

  // Going from one listed folder to the next starts at its top, and the keyboard
  // on its first entry; going up, on the folder it came from.
  const outsidePath = outside?.path;
  useEffect(() => {
    if (outsidePath !== undefined) listRef.current?.scrollTo({ top: 0 });
  }, [outsidePath]);
  useEffect(() => {
    const { cursorPath, listFocused } = cursorStore.getState();
    if (outsidePath === undefined || !listFocused || items.length === 0) return;
    const at = items.findIndex((it) => it.path === cursorPath);
    if (at < 0) setCursorPath(items[firstRow(items)].path);
    else ensureVisible(at);
  }, [outsidePath, items, cursorStore, setCursorPath, ensureVisible]);

  // A name field scrolls into view, so it is mounted to take the focus.
  const editPath = edits?.view?.path ?? null;
  const itemsRef = useRef(items);
  itemsRef.current = items;
  useEffect(() => {
    if (editPath !== null) ensureVisible(itemsRef.current.findIndex((it) => it.path === editPath));
  }, [editPath, ensureVisible]);

  // A breadcrumb reveal lands the cursor on that folder and hands the list
  // focus, so the arrow keys continue from there.
  useEffect(() => {
    if (!cursorRequest) return;
    setCursorPath(cursorRequest.path);
    const list = listRef.current;
    if (!list) return;
    if (cursorRequest.path === "") list.scrollTo({ top: 0 });
    list.focus();
  }, [cursorRequest]);

  useEffect(() => {
    if (!filterFocusRequest) return;
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    input.select();
  }, [filterFocusRequest]);

  useEffect(() => {
    if (!onCursorChange) return;
    const report = () => {
      const { cursorPath, listFocused } = cursorStore.getState();
      const current = items.find((it) => it.path === cursorPath) ?? null;
      onCursorChange(listFocused ? current : null);
    };
    report();
    return cursorStore.subscribe((s, prev) => {
      if (s.cursorPath !== prev.cursorPath || s.listFocused !== prev.listFocused) report();
    });
  }, [onCursorChange, items, cursorStore]);

  const activate = useCallback(
    (item: Item, opts?: ActivateOptions) => {
      setCursorPath(item.path);
      if (outside) outside.onOpen(item);
      else onActivate(item, opts);
    },
    [outside, onActivate, setCursorPath],
  );

  const moveCursor = (index: number) => {
    if (items.length === 0) return;
    setCursorPath(items[Math.max(0, Math.min(items.length - 1, index))].path);
  };

  const onListKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const { cursorPath } = cursorStore.getState();
    const index = items.findIndex((it) => it.path === cursorPath);
    const current = index >= 0 ? items[index] : null;
    if (edits && !edits.blocked && !outside && current && matchesChord(e.nativeEvent, TRASH_CHORD)) {
      e.preventDefault();
      const next = items.slice(index + 1).find((it) => !isUnder(it.path, current.path)) ?? items[index - 1];
      edits.trash(current);
      setCursorPath(next?.path ?? null);
      return;
    }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    switch (e.key) {
      case "ArrowDown":
        moveCursor(index + 1);
        break;
      case "ArrowUp":
        if (index <= 0) inputRef.current?.focus();
        else moveCursor(index - 1);
        break;
      case "Home":
        moveCursor(0);
        break;
      case "End":
        moveCursor(items.length - 1);
        break;
      case "ArrowRight": {
        if (!current || !current.isDir) return;
        if (outside) activate(current);
        // Matched folders are already open; there is nothing to toggle.
        else if (filtering || current.expanded) moveCursor(index + 1);
        else onToggleDir(current.path);
        break;
      }
      case "ArrowLeft": {
        if (outside) {
          setCursorPath(outside.path);
          outside.onUp();
          break;
        }
        if (!current) return;
        if (!filtering && current.isDir && current.expanded) {
          onToggleDir(current.path);
          break;
        }
        const parent = parentPath(current.path);
        if (parent) setCursorPath(parent);
        break;
      }
      case "Enter":
        if (current) activate(current, { focusEditor: true });
        break;
      case " ":
        if (current) activate(current);
        break;
      case "/":
        inputRef.current?.focus();
        inputRef.current?.select();
        break;
      default:
        return;
    }
    e.preventDefault();
  };

  const focusList = () => {
    const { cursorPath } = cursorStore.getState();
    const at = items.findIndex((it) => it.path === cursorPath);
    moveCursor(at >= 0 ? at : outside ? firstRow(items) : 0);
    listRef.current?.focus();
  };

  const onInputKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      focusList();
    } else if (e.key === "Enter") {
      // The cursor's row, else the best-ranked match rather than the tree's
      // first row, which is whichever folder sorts first.
      const { cursorPath } = cursorStore.getState();
      const target: Item | undefined = items.find((it) => it.path === cursorPath) ?? results?.[0];
      const openBest = () => {
        if (filtering && target) activate(target, { focusEditor: true });
      };
      if (!onEnter?.({ openBest, focusList })) openBest();
    } else if (e.key === "Escape" && query) {
      e.preventDefault();
      e.stopPropagation();
      onQueryChange("");
    }
  };

  const renderRows = (list: TreeRow[]): ReactNode => (
    <FilesRows
      rows={list}
      first={virtual.first}
      last={virtual.last}
      paddingTop={virtual.paddingTop}
      paddingBottom={virtual.paddingBottom}
      decorations={decorations}
      ignoredPaths={ignoredPaths}
      dirtyPaths={dirtyPaths}
      cursorStore={cursorStore}
      onActivate={activate}
      onContextMenu={outside ? NO_MENU : onRowMenu}
      onDiscard={onDiscard}
      checks={checks}
      onCheck={onCheck}
      nameEdit={edits?.view}
    />
  );

  const renderList = (): ReactNode => {
    if (outside) {
      return (
        <>
          {renderRows(items)}
          {outside.note && <FilesNote tone={outside.note.bad ? "bad" : "muted"}>{outside.note.text}</FilesNote>}
        </>
      );
    }
    if (filtering) {
      if (results === null) return <FilesNote>{changesOnly ? "Loading…" : "Indexing files…"}</FilesNote>;
      if (items.length === 0) {
        if (pathRow) return null;
        if (noMatches && !changesOnly) return noMatches;
        return <FilesNote>{changesOnly ? "No matching changed files" : "No matching files"}</FilesNote>;
      }
      return renderRows(items);
    }
    if (changesOnly) {
      if (changes.status === "error") {
        return <FilesNote tone="bad">Couldn't list the changes: {changes.message}</FilesNote>;
      }
      if (changes.status === "loading") return <FilesNote>Loading…</FilesNote>;
      if (items.length === 0) return <FilesNote>No uncommitted changes</FilesNote>;
      return renderRows(items);
    }
    if (rootListing?.status === "error") {
      return <FilesNote tone="bad">Couldn't read the project folder: {rootListing.message}</FilesNote>;
    }
    if (!rootListing || rootListing.status === "loading") return <FilesNote>Loading…</FilesNote>;
    if (items.length === 0) return <FilesNote>This folder is empty</FilesNote>;
    return renderRows(items);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <FilesFilterBox
        inputRef={inputRef}
        query={query}
        onQueryChange={onQueryChange}
        onKeyDown={onInputKeyDown}
        changesOnly={changesOnly}
        newFile={
          edits && {
            blocked: edits.blocked,
            onCreate: () => edits.create(selectedPath ? parentPath(selectedPath) : "", false),
          }
        }
      />
      {changesOnly && !filtering && changes.status === "ready" && changes.files.length > 0 && (
        <FilesAllChangesRow
          count={changes.files.length}
          selected={allChanges}
          onToggle={() => onAllChangesChange(!allChanges)}
        />
      )}
      {filtering && pathRow}
      <div
        ref={listRef}
        role="tree"
        aria-label={outside ? "Folder contents" : filtering ? "Matching files" : changesOnly ? "Changed files" : "Project files"}
        tabIndex={0}
        onKeyDown={onListKeyDown}
        onFocus={() => cursorStore.setState({ listFocused: true })}
        onBlur={() => cursorStore.setState({ listFocused: false })}
        className="min-h-0 flex-1 overflow-y-auto py-1 outline-none"
      >
        {renderList()}
      </div>
      {filtering && !outside && results && resultsTotal > results.length && (
        <p className="border-t border-[var(--border)] px-3 py-1.5 text-[10.5px] text-[var(--text-muted)]">
          {results.length.toLocaleString()} of {resultsTotal.toLocaleString()} shown · type more to narrow
        </p>
      )}
    </div>
  );
}

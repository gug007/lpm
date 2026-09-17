import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { basename } from "../../path";
import { SearchIcon, XIcon } from "../icons";
import { FilesRow, type RowTarget } from "./FilesRow";
import type { IndexEntry } from "./filesFilter";
import { parentPath, type Item, type Listing, type TreeRow } from "./treeModel";

export interface CursorRequest {
  path: string;
  seq: number;
}

export interface ActivateOptions {
  // Enter opens a file and moves on to editing it; Space and a click keep the
  // tree, so a browse stays a browse.
  focusEditor?: boolean;
}

const NO_ITEMS: Item[] = [];

interface FilesTreeProps {
  rows: TreeRow[];
  rootListing: Listing | undefined;
  selectedPath: string | null;
  dirtyPaths: ReadonlySet<string>;
  query: string;
  onQueryChange: (query: string) => void;
  // null while the index is still being built.
  results: IndexEntry[] | null;
  cursorRequest: CursorRequest | null;
  // Bumped to put the caret in the filter box with its text selected.
  filterFocusRequest: number;
  onActivate: (item: Item, opts?: ActivateOptions) => void;
  onToggleDir: (path: string) => void;
  onRowMenu: (target: RowTarget) => void;
  // The row the keyboard cursor sits on while the list has focus, else null:
  // the target of the path chords when they fire from the tree.
  onCursorChange?: (item: Item | null) => void;
}

const INPUT_CLASS =
  "h-7 w-full rounded-md border border-[var(--border)] bg-[var(--bg-secondary)] pl-7 pr-6 text-[12px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--accent-cyan)]";

// The rail: a filter box over either the folder tree or, while a filter is
// typed, the ranked matches. One keyboard cursor serves both lists.
export function FilesTree({
  rows,
  rootListing,
  selectedPath,
  dirtyPaths,
  query,
  onQueryChange,
  results,
  cursorRequest,
  filterFocusRequest,
  onActivate,
  onToggleDir,
  onRowMenu,
  onCursorChange,
}: FilesTreeProps) {
  const filtering = query.trim() !== "";
  const items: Item[] = filtering ? (results ?? NO_ITEMS) : rows;
  const [cursorPath, setCursorPath] = useState<string | null>(null);
  const [listFocused, setListFocused] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Keyboard travel starts from the open file.
  useEffect(() => {
    if (selectedPath) setCursorPath(selectedPath);
  }, [selectedPath]);

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
    const current = items.find((it) => it.path === cursorPath) ?? null;
    onCursorChange(listFocused ? current : null);
  }, [onCursorChange, items, cursorPath, listFocused]);

  const activate = useCallback(
    (item: Item, opts?: ActivateOptions) => {
      setCursorPath(item.path);
      onActivate(item, opts);
    },
    [onActivate],
  );

  const moveCursor = (index: number) => {
    if (items.length === 0) return;
    setCursorPath(items[Math.max(0, Math.min(items.length - 1, index))].path);
  };

  const onListKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const index = items.findIndex((it) => it.path === cursorPath);
    const current = index >= 0 ? items[index] : null;
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
        if (!current || filtering || !current.isDir) return;
        if ((current as TreeRow).expanded) moveCursor(index + 1);
        else onToggleDir(current.path);
        break;
      }
      case "ArrowLeft": {
        if (!current || filtering) return;
        if (current.isDir && (current as TreeRow).expanded) {
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

  const onInputKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      moveCursor(Math.max(0, items.findIndex((it) => it.path === cursorPath)));
      listRef.current?.focus();
    } else if (e.key === "Enter") {
      const target = items.find((it) => it.path === cursorPath) ?? items[0];
      if (filtering && target) activate(target, { focusEditor: true });
    } else if (e.key === "Escape" && query) {
      e.preventDefault();
      e.stopPropagation();
      onQueryChange("");
    }
  };

  const renderList = (): ReactNode => {
    if (filtering) {
      if (results === null) return <Note>Indexing files…</Note>;
      if (results.length === 0) return <Note>No matching files</Note>;
      return results.map((entry) => (
        <FilesRow
          key={entry.path}
          item={entry}
          name={basename(entry.path)}
          subtitle={parentPath(entry.path)}
          selected={entry.path === selectedPath}
          cursor={listFocused && entry.path === cursorPath}
          dirty={dirtyPaths.has(entry.path)}
          onActivate={activate}
          onContextMenu={onRowMenu}
        />
      ));
    }
    if (rootListing?.status === "error") {
      return <Note tone="bad">Couldn't read the project folder: {rootListing.message}</Note>;
    }
    if (!rootListing || rootListing.status === "loading") return <Note>Loading…</Note>;
    if (rows.length === 0) return <Note>This folder is empty</Note>;
    return rows.map((row) => (
      <FilesRow
        key={row.path}
        item={row}
        name={row.name}
        depth={row.depth}
        expanded={row.expanded}
        loading={row.loading}
        error={row.error}
        selected={row.path === selectedPath}
        cursor={listFocused && row.path === cursorPath}
        dirty={dirtyPaths.has(row.path)}
        onActivate={activate}
        onContextMenu={onRowMenu}
      />
    ));
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 px-2 pb-1 pt-2">
        <div className="relative">
          <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[var(--text-muted)] [&>svg]:h-3 [&>svg]:w-3">
            <SearchIcon />
          </span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            onKeyDown={onInputKeyDown}
            placeholder="Filter files…"
            aria-label="Filter files"
            spellCheck={false}
            autoCorrect="off"
            autoCapitalize="off"
            data-text-scope=""
            className={INPUT_CLASS}
          />
          {query && (
            <button
              type="button"
              onClick={() => {
                onQueryChange("");
                inputRef.current?.focus();
              }}
              aria-label="Clear filter"
              className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-0.5 text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)] [&>svg]:h-3 [&>svg]:w-3"
            >
              <XIcon />
            </button>
          )}
        </div>
      </div>
      <div
        ref={listRef}
        role={filtering ? "listbox" : "tree"}
        aria-label={filtering ? "Matching files" : "Project files"}
        tabIndex={0}
        onKeyDown={onListKeyDown}
        onFocus={() => setListFocused(true)}
        onBlur={() => setListFocused(false)}
        className="min-h-0 flex-1 overflow-y-auto py-1 outline-none"
      >
        {renderList()}
      </div>
    </div>
  );
}

function Note({ tone = "muted", children }: { tone?: "muted" | "bad"; children: ReactNode }) {
  return (
    <p
      className={`break-words px-4 py-6 text-center text-[11px] ${
        tone === "bad" ? "text-[var(--accent-red-text)]" : "text-[var(--text-muted)]"
      }`}
    >
      {children}
    </p>
  );
}

import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { SearchIcon, XIcon } from "../icons";
import { FilesResultRow } from "./FilesResultRow";
import { FilesTreeRow, type RowTarget } from "./FilesTreeRow";
import type { IndexEntry } from "./filesFilter";
import { parentPath, type Listing, type TreeRow } from "./treeModel";

export interface CursorRequest {
  path: string;
  seq: number;
}

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
  onToggleDir: (path: string) => void;
  onOpenFile: (path: string) => void;
  onRevealDir: (path: string) => void;
  onRowMenu: (target: RowTarget) => void;
}

type Item = { path: string; isDir: boolean };

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
  onToggleDir,
  onOpenFile,
  onRevealDir,
  onRowMenu,
}: FilesTreeProps) {
  const filtering = query.trim() !== "";
  const items: Item[] = filtering ? (results ?? []) : rows;
  const [cursorPath, setCursorPath] = useState<string | null>(null);
  const [listFocused, setListFocused] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Keyboard travel starts from the open file, or from a folder the breadcrumb
  // just revealed.
  useEffect(() => {
    if (selectedPath) setCursorPath(selectedPath);
  }, [selectedPath]);
  useEffect(() => {
    if (!cursorRequest) return;
    setCursorPath(cursorRequest.path);
    if (cursorRequest.path === "") listRef.current?.scrollTo({ top: 0 });
  }, [cursorRequest]);

  const activate = useCallback(
    (item: Item) => {
      setCursorPath(item.path);
      if (!item.isDir) onOpenFile(item.path);
      else if (filtering) onRevealDir(item.path);
      else onToggleDir(item.path);
    },
    [filtering, onOpenFile, onRevealDir, onToggleDir],
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
      case " ":
        if (current) activate(current);
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
      if (filtering && target) activate(target);
    } else if (e.key === "Escape" && query) {
      e.preventDefault();
      e.stopPropagation();
      onQueryChange("");
    }
  };

  const list = filtering ? (
    results === null ? (
      <Note>Indexing files…</Note>
    ) : results.length === 0 ? (
      <Note>No matching files</Note>
    ) : (
      results.map((entry) => (
        <FilesResultRow
          key={entry.path}
          entry={entry}
          selected={entry.path === selectedPath}
          cursor={entry.path === cursorPath}
          focused={listFocused}
          dirty={dirtyPaths.has(entry.path)}
          onActivate={activate}
          onContextMenu={onRowMenu}
        />
      ))
    )
  ) : rootListing?.status === "error" ? (
    <Note tone="bad">Couldn't read the project folder: {rootListing.message}</Note>
  ) : !rootListing || rootListing.status === "loading" ? (
    <Note>Loading…</Note>
  ) : rows.length === 0 ? (
    <Note>This folder is empty</Note>
  ) : (
    rows.map((row) => (
      <FilesTreeRow
        key={row.path}
        row={row}
        selected={row.path === selectedPath}
        cursor={row.path === cursorPath}
        focused={listFocused}
        dirty={dirtyPaths.has(row.path)}
        onActivate={activate}
        onContextMenu={onRowMenu}
      />
    ))
  );

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
        {list}
      </div>
    </div>
  );
}

function Note({ tone = "muted", children }: { tone?: "muted" | "bad"; children: React.ReactNode }) {
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

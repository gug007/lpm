"use client";

import { useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Search, X } from "lucide-react";
import { NO_AUTOFILL } from "./no-autofill";
import type { IndexEntry } from "./files-filter";
import { buildMatchTree, parentPath, type TreeRow } from "./files-model";
import { FilesRow } from "./files-row";
import { FilesViewSwitch } from "./files-view-switch";
import type { GitStatus } from "./git-decorations";
import { FOCUS_RING } from "./ui";

const INPUT_CLASS =
  "h-7 w-full rounded-md border border-[#2e2e2e] bg-[#242424] pl-7 pr-6 text-[12px] text-[#e5e5e5] outline-none placeholder:text-[#919191] focus:border-[#22d3ee]";

const NO_ROWS: TreeRow[] = [];

// The rail: a filter box over the folder tree, or, while a filter is typed,
// over the matches shown under their folders. One keyboard cursor serves both.
export function FilesTree({
  rows,
  changesOnly,
  changeCount,
  onChangesOnlyChange,
  decorations,
  selectedPath,
  query,
  onQueryChange,
  results,
  onActivate,
}: {
  rows: TreeRow[];
  changesOnly: boolean;
  changeCount: number;
  onChangesOnlyChange: (on: boolean) => void;
  decorations: ReadonlyMap<string, GitStatus>;
  selectedPath: string | null;
  query: string;
  onQueryChange: (query: string) => void;
  // null while nothing is typed.
  results: IndexEntry[] | null;
  onActivate: (row: TreeRow) => void;
}) {
  const filtering = query.trim() !== "";
  const matchRows = useMemo(() => (results ? buildMatchTree(results) : NO_ROWS), [results]);
  const items = filtering ? matchRows : rows;
  const [cursorPath, setCursorPath] = useState<string | null>(null);
  const [cursorFollows, setCursorFollows] = useState<string | null>(null);
  const [listFocused, setListFocused] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Keyboard travel starts from the open file, wherever it was opened from.
  if (selectedPath && selectedPath !== cursorFollows) {
    setCursorFollows(selectedPath);
    setCursorPath(selectedPath);
  }

  const moveCursor = (index: number) => {
    if (items.length === 0) return;
    setCursorPath(items[Math.max(0, Math.min(items.length - 1, index))].path);
  };

  const activate = (row: TreeRow) => {
    setCursorPath(row.path);
    onActivate(row);
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
        if (index <= 0) inputRef.current?.focus({ preventScroll: true });
        else moveCursor(index - 1);
        break;
      case "Home":
        moveCursor(0);
        break;
      case "End":
        moveCursor(items.length - 1);
        break;
      case "ArrowRight":
        if (!current?.isDir) return;
        if (filtering || current.expanded) moveCursor(index + 1);
        else activate(current);
        break;
      case "ArrowLeft": {
        if (!current) return;
        if (!filtering && current.isDir && current.expanded) {
          activate(current);
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
      case "/":
        inputRef.current?.focus({ preventScroll: true });
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
      listRef.current?.focus({ preventScroll: true });
    } else if (e.key === "Enter") {
      // The cursor's row, else the best-ranked match rather than the tree's
      // first row, which is whichever folder sorts first.
      const target = items.find((it) => it.path === cursorPath) ?? matchRows[0];
      if (filtering && target) activate(target);
    } else if (e.key === "Escape" && query) {
      e.preventDefault();
      e.stopPropagation();
      onQueryChange("");
    }
  };

  const renderList = (): ReactNode => {
    if (filtering) {
      if (items.length === 0) {
        return <Note>{changesOnly ? "No matching changed files" : "No matching files"}</Note>;
      }
    } else if (changesOnly && items.length === 0) {
      return <Note>No uncommitted changes</Note>;
    }
    return items.map((row) => (
      <FilesRow
        key={row.path}
        row={row}
        selected={row.path === selectedPath}
        cursor={listFocused && row.path === cursorPath}
        status={decorations.get(row.path)}
        onActivate={activate}
      />
    ));
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <FilesViewSwitch
        changesOnly={changesOnly}
        count={changeCount}
        onChange={onChangesOnlyChange}
      />
      <div className="shrink-0 px-2 pb-1 pt-2">
        <div className="relative">
          <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[#919191]">
            <Search className="h-3 w-3" />
          </span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            onKeyDown={onInputKeyDown}
            placeholder={changesOnly ? "Filter changed files…" : "Filter files…"}
            aria-label="Filter files"
            {...NO_AUTOFILL}
            className={INPUT_CLASS}
          />
          {query && (
            <button
              type="button"
              onClick={() => {
                onQueryChange("");
                inputRef.current?.focus({ preventScroll: true });
              }}
              aria-label="Clear filter"
              className={`absolute right-1 top-1/2 -translate-y-1/2 rounded p-0.5 text-[#919191] transition-colors hover:text-[#e5e5e5] ${FOCUS_RING}`}
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>
      <div
        ref={listRef}
        role="tree"
        aria-label={filtering ? "Matching files" : changesOnly ? "Changed files" : "Project files"}
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

function Note({ children }: { children: ReactNode }) {
  return (
    <p className="break-words px-4 py-6 text-center text-[11px] text-[#919191]">{children}</p>
  );
}

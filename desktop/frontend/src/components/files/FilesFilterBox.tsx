import type { KeyboardEvent, RefObject } from "react";
import { PlusIcon, SearchIcon, XIcon } from "../icons";
import { Tooltip } from "../ui/Tooltip";
import { TEXT_INPUT, fieldInputClass } from "./searchFieldStyles";

interface FilesFilterBoxProps {
  inputRef: RefObject<HTMLInputElement | null>;
  query: string;
  onQueryChange: (query: string) => void;
  onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void;
  changesOnly: boolean;
  // The New file button beside the box; left out where the tree can't change.
  newFile?: { blocked: string | null; onCreate: () => void };
}

export function FilesFilterBox({
  inputRef,
  query,
  onQueryChange,
  onKeyDown,
  changesOnly,
  newFile,
}: FilesFilterBoxProps) {
  return (
    <div className="flex shrink-0 items-center gap-1 px-2 pb-1 pt-2">
      <div className="relative min-w-0 flex-1">
        <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[var(--text-muted)] [&>svg]:h-3 [&>svg]:w-3">
          <SearchIcon />
        </span>
        <input
          {...TEXT_INPUT}
          ref={inputRef}
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={changesOnly ? "Filter changed files…" : "Filter files…"}
          aria-label="Filter files"
          className={`${fieldInputClass(false)} pl-7 pr-6`}
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
      {newFile && (
        <Tooltip content={newFile.blocked ?? "New file"} side="bottom">
          <button
            type="button"
            onClick={newFile.onCreate}
            disabled={newFile.blocked !== null}
            aria-label="New file"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-40 disabled:hover:bg-transparent [&>svg]:h-3.5 [&>svg]:w-3.5"
          >
            <PlusIcon />
          </button>
        </Tooltip>
      )}
    </div>
  );
}

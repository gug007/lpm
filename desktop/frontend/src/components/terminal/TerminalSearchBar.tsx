import { useEffect, useRef, useState } from "react";
import { IconBtn } from "./IconBtn";
import { ArrowDownIcon, ChevronUpIcon, FilterIcon, SearchIcon } from "./icons";
import { XIcon } from "../icons";

interface TerminalSearchBarProps {
  filterMode: boolean;
  matchCount: number;
  onFindNext: (query: string) => boolean;
  onFindPrevious: (query: string) => boolean;
  onFilterChange: (query: string | null) => void;
  onToggleFilterMode: () => void;
  onClose: () => void;
}

export function TerminalSearchBar({
  filterMode,
  matchCount,
  onFindNext,
  onFindPrevious,
  onFilterChange,
  onToggleFilterMode,
  onClose,
}: TerminalSearchBarProps) {
  const [query, setQuery] = useState("");
  const [notFound, setNotFound] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  // Re-apply the current query whenever the mode flips so toggling between
  // filtering and highlighting takes effect immediately.
  useEffect(() => {
    if (filterMode) {
      setNotFound(false);
      onFilterChange(query || null);
    } else {
      onFilterChange(null);
      setNotFound(query ? !onFindNext(query) : false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterMode]);

  const runSearch = (direction: "next" | "prev") => {
    if (!query) {
      setNotFound(false);
      return;
    }
    const found = direction === "next" ? onFindNext(query) : onFindPrevious(query);
    setNotFound(!found);
  };

  const handleChange = (value: string) => {
    setQuery(value);
    if (filterMode) {
      setNotFound(false);
      onFilterChange(value || null);
      return;
    }
    if (!value) {
      setNotFound(false);
      return;
    }
    setNotFound(!onFindNext(value));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      if (!filterMode) runSearch(e.shiftKey ? "prev" : "next");
    }
  };

  const inputClass = `w-44 bg-transparent font-mono text-[11px] outline-none placeholder:text-[var(--text-muted)] ${
    notFound ? "text-[var(--accent-red)]" : "text-[var(--text-primary)]"
  }`;

  return (
    <div className="absolute right-2 top-2 z-30 flex items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--terminal-header)] px-2 py-1 shadow-md">
      <span className="text-[var(--text-muted)]">
        <SearchIcon />
      </span>
      <input
        ref={inputRef}
        type="text"
        value={query}
        placeholder={filterMode ? "Filter" : "Find"}
        onChange={(e) => handleChange(e.target.value)}
        onKeyDown={handleKeyDown}
        className={inputClass}
      />
      {filterMode && query && (
        <span className="shrink-0 font-mono text-[10px] tabular-nums text-[var(--text-muted)]">
          {matchCount}
        </span>
      )}
      <IconBtn
        onClick={onToggleFilterMode}
        title={
          filterMode
            ? "Showing only matching lines (click to find instead)"
            : "Find matches (click to show only matching lines)"
        }
        active={filterMode}
      >
        <FilterIcon />
      </IconBtn>
      {!filterMode && (
        <>
          <IconBtn onClick={() => runSearch("prev")} title="Previous match (Shift+Enter)">
            <ChevronUpIcon />
          </IconBtn>
          <IconBtn onClick={() => runSearch("next")} title="Next match (Enter)">
            <ArrowDownIcon />
          </IconBtn>
        </>
      )}
      <IconBtn onClick={onClose} title="Close (Esc)">
        <XIcon />
      </IconBtn>
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import { IconBtn } from "./IconBtn";
import { ArrowDownIcon, ChevronUpIcon, SearchIcon } from "./icons";
import { XIcon } from "../icons";

interface TerminalSearchBarProps {
  onFindNext: (query: string) => boolean;
  onFindPrevious: (query: string) => boolean;
  onClose: () => void;
}

export function TerminalSearchBar({ onFindNext, onFindPrevious, onClose }: TerminalSearchBarProps) {
  const [query, setQuery] = useState("");
  const [notFound, setNotFound] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

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
      runSearch(e.shiftKey ? "prev" : "next");
    }
  };

  const inputClass = `w-44 bg-transparent font-mono text-[11px] outline-none placeholder:text-[var(--text-muted)] ${
    notFound ? "text-[var(--accent-red)]" : "text-[var(--text-primary)]"
  }`;

  return (
    <div className="absolute right-2 top-2 z-10 flex items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--terminal-header)] px-2 py-1 shadow-md">
      <span className="text-[var(--text-muted)]">
        <SearchIcon />
      </span>
      <input
        ref={inputRef}
        type="text"
        value={query}
        placeholder="Find"
        onChange={(e) => handleChange(e.target.value)}
        onKeyDown={handleKeyDown}
        className={inputClass}
      />
      <IconBtn onClick={() => runSearch("prev")} title="Previous match (Shift+Enter)">
        <ChevronUpIcon />
      </IconBtn>
      <IconBtn onClick={() => runSearch("next")} title="Next match (Enter)">
        <ArrowDownIcon />
      </IconBtn>
      <IconBtn onClick={onClose} title="Close (Esc)">
        <XIcon />
      </IconBtn>
    </div>
  );
}

import type { RefObject } from "react";
import { SearchIcon, XIcon } from "../icons";

interface NotesSearchBarProps {
  inputRef: RefObject<HTMLInputElement | null>;
  value: string;
  onChange: (value: string) => void;
  onClose: () => void;
}

export function NotesSearchBar({ inputRef, value, onChange, onClose }: NotesSearchBarProps) {
  return (
    <div className="relative mb-3 flex items-center">
      <div className="pointer-events-none absolute left-3 text-[var(--text-muted)]">
        <SearchIcon />
      </div>
      <input
        ref={inputRef}
        type="text"
        placeholder="Search notes"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
        }}
        className="h-9 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] pl-9 pr-9 text-[13px] outline-none transition-colors placeholder:text-[var(--text-muted)] focus:border-[var(--text-muted)]"
      />
      <button
        type="button"
        onClick={onClose}
        aria-label="Close search"
        title="Close search"
        className="absolute right-2 flex h-6 w-6 items-center justify-center rounded-md text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
      >
        <XIcon />
      </button>
    </div>
  );
}

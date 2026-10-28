import { SearchIcon } from "../icons";

interface FilesContentSearchProps {
  query: string;
  onSearch: (query: string) => void;
}

// What the filter offers when no file name matches: the same text searched
// inside the files, in the Search view.
export function FilesContentSearch({ query, onSearch }: FilesContentSearchProps) {
  const needle = query.trim();
  return (
    <div className="flex flex-col gap-1 px-2 py-3 text-[11px]">
      <p className="break-words px-2 pb-1 text-center text-[var(--text-muted)]">No file name matches “{needle}”</p>
      <button
        type="button"
        onClick={() => onSearch(needle)}
        className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] [&_svg]:h-3.5 [&_svg]:w-3.5"
      >
        <SearchIcon />
        Search inside files
      </button>
    </div>
  );
}

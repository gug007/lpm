import type { KeyboardEvent, ReactNode, RefObject } from "react";
import { CaseSensitive, ChevronRight, ListFilter, Regex, WholeWord } from "lucide-react";
import { SearchIcon } from "../icons";
import { Tooltip } from "../ui/Tooltip";
import type { SearchOptions } from "./fileSearch";
import { FIELD_ERROR, TEXT_INPUT, fieldInputClass, sideButtonClass } from "./searchFieldStyles";

const TOGGLES: Array<{ key: keyof SearchOptions; label: string; icon: ReactNode }> = [
  { key: "matchCase", label: "Match case", icon: <CaseSensitive size={14} strokeWidth={1.8} /> },
  { key: "wholeWord", label: "Match whole word", icon: <WholeWord size={14} strokeWidth={1.8} /> },
  { key: "regex", label: "Use regular expression", icon: <Regex size={14} strokeWidth={1.8} /> },
];

interface FilesSearchFieldProps {
  inputRef: RefObject<HTMLInputElement | null>;
  query: string;
  onQueryChange: (query: string) => void;
  onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void;
  options: SearchOptions;
  onToggle: (key: keyof SearchOptions) => void;
  // Why the pattern isn't a regex, shown under the field.
  invalid: string | null;
  replaceOpen: boolean;
  onToggleReplace: () => void;
  filtersOpen: boolean;
  // Some file filter is typed, so the button shows it while they're hidden.
  filtersSet: boolean;
  onToggleFilters: () => void;
}

// The query with its toggles, between the button that opens the replace field
// and the one that opens the file filters.
export function FilesSearchField({
  inputRef,
  query,
  onQueryChange,
  onKeyDown,
  options,
  onToggle,
  invalid,
  replaceOpen,
  onToggleReplace,
  filtersOpen,
  filtersSet,
  onToggleFilters,
}: FilesSearchFieldProps) {
  return (
    <div className="shrink-0 px-2 pt-2">
      <div className="flex items-center gap-1">
        <Tooltip content={replaceOpen ? "Hide replace" : "Replace"} side="bottom">
          <button
            type="button"
            onClick={onToggleReplace}
            aria-label="Replace"
            aria-expanded={replaceOpen}
            className={sideButtonClass()}
          >
            <ChevronRight
              size={14}
              strokeWidth={1.8}
              className={`transition-transform duration-150 ${replaceOpen ? "rotate-90" : ""}`}
            />
          </button>
        </Tooltip>
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
            placeholder="Search in files…"
            aria-label="Search in files"
            aria-invalid={invalid !== null}
            className={`${fieldInputClass(invalid !== null)} pl-7 pr-[74px]`}
          />
          <div className="absolute right-1 top-1/2 flex -translate-y-1/2 items-center gap-0.5">
            {TOGGLES.map(({ key, label, icon }) => (
              <Tooltip key={key} content={label} side="bottom">
                <button
                  type="button"
                  onClick={() => {
                    onToggle(key);
                    inputRef.current?.focus();
                  }}
                  aria-label={label}
                  aria-pressed={options[key]}
                  className={`flex h-5 w-5 items-center justify-center rounded transition-colors ${
                    options[key]
                      ? "bg-[var(--bg-active)] text-[var(--accent-cyan)]"
                      : "text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  {icon}
                </button>
              </Tooltip>
            ))}
          </div>
        </div>
        <Tooltip content={filtersOpen ? "Hide file filters" : "Files to include or exclude"} side="bottom">
          <button
            type="button"
            onClick={onToggleFilters}
            aria-label="Files to include or exclude"
            aria-expanded={filtersOpen}
            className={sideButtonClass(filtersSet && !filtersOpen)}
          >
            <ListFilter size={14} strokeWidth={1.8} />
          </button>
        </Tooltip>
      </div>
      {invalid !== null && (
        <p role="alert" className={`${FIELD_ERROR} pl-6 pr-6`}>
          Not a valid regular expression: {invalid}
        </p>
      )}
    </div>
  );
}

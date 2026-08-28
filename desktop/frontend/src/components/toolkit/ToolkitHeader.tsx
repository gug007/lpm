import type { RefObject } from "react";
import { SearchIcon, XIcon } from "../icons";
import { AIButton } from "../ui/AIButton";
import { FIELD, QUIET_BUTTON } from "./surfaces";

export type CliFilter = "all" | "claude" | "codex";

const CLI_OPTIONS: { value: CliFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "claude", label: "Claude" },
  { value: "codex", label: "Codex" },
];

interface ToolkitHeaderProps {
  cli: CliFilter;
  onCli: (cli: CliFilter) => void;
  query: string;
  onQuery: (query: string) => void;
  // What the filter is filtering, so the placeholder can say how much there is.
  count: number;
  loading: boolean;
  onRescan: () => void;
  canCreate: boolean;
  onCreate: () => void;
  // The list owns `/` and Escape, so it needs the field it is aiming them at.
  searchRef: RefObject<HTMLInputElement | null>;
}

// The pane's one control row: which CLI is being described, the live filter,
// re-scan, and the only thing this pane writes.
export function ToolkitHeader({
  cli,
  onCli,
  query,
  onQuery,
  count,
  loading,
  onRescan,
  canCreate,
  onCreate,
  searchRef,
}: ToolkitHeaderProps) {
  return (
    <div className="flex shrink-0 items-center gap-2">
      <div
        role="group"
        aria-label="Agent CLI"
        className="flex shrink-0 gap-0.5 rounded-[var(--tk-radius-s)] bg-[var(--tk-panel)] p-0.5"
      >
        {CLI_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onCli(option.value)}
            aria-pressed={cli === option.value}
            className={`rounded-[7px] px-2 py-[3px] text-[10.5px] transition-colors ${
              cli === option.value
                ? "bg-[var(--tk-active)] text-[var(--text-primary)]"
                : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      <label className={`${FIELD} flex flex-1 items-center gap-1.5`}>
        <span className="text-[var(--text-muted)] [&>svg]:h-3.5 [&>svg]:w-3.5">
          <SearchIcon />
        </span>
        <input
          ref={searchRef}
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder={count > 0 ? `Filter ${count} capabilities` : "Filter"}
          spellCheck={false}
          aria-label="Filter capabilities"
          className="min-w-0 flex-1 bg-transparent text-[11.5px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none"
        />
        {query && (
          <button
            type="button"
            onClick={() => onQuery("")}
            aria-label="Clear filter"
            className="shrink-0 text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)] [&>svg]:h-3 [&>svg]:w-3"
          >
            <XIcon />
          </button>
        )}
      </label>

      <button onClick={onRescan} disabled={loading} className={QUIET_BUTTON}>
        {loading ? "Scanning…" : "Re-scan"}
      </button>

      {/* The app's AI button, because the form behind it drafts the skill for
          you. Wrapped rather than restyled: the row's other controls hold their
          width and the filter absorbs the squeeze, so the pill must not shrink
          into its own label. */}
      {canCreate && (
        <div className="shrink-0">
          <AIButton onClick={onCreate}>
            New skill
          </AIButton>
        </div>
      )}
    </div>
  );
}

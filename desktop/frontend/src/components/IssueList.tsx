import { useEffect, useMemo, useRef, useState } from "react";
import { useOpenIssues } from "../hooks/useOpenIssues";
import { filterIssues, type OpenIssue } from "../issues";

interface IssueListProps {
  root: string;
  onPick: (issue: OpenIssue) => void;
  onClose: () => void;
}

const NOTE = "px-3 py-2 text-[12px] text-[var(--text-muted)]";

// A repository's open issues with a search box; ↑ ↓ and ↵ pick one.
export function IssueList({ root, onPick, onClose }: IssueListProps) {
  const { issues, error } = useOpenIssues(root, true);
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const shown = useMemo(() => filterIssues(issues ?? [], query), [issues, query]);
  const active = Math.min(index, Math.max(shown.length - 1, 0));

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    listRef.current?.children[active]?.scrollIntoView({ block: "nearest" });
  }, [active]);

  return (
    <div className="border-t border-[var(--border)] p-2">
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setIndex(0);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") setIndex(Math.min(active + 1, shown.length - 1));
          else if (e.key === "ArrowUp") setIndex(Math.max(active - 1, 0));
          else if (e.key === "Escape") onClose();
          else if (e.key === "Enter") {
            if (shown[active]) onPick(shown[active]);
          } else return;
          e.preventDefault();
          e.stopPropagation();
        }}
        placeholder="Search issues by number, title, label or author"
        aria-label="Search issues"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        className="w-full rounded-md bg-[var(--bg-hover)] px-2.5 py-1.5 text-[13px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
      />
      <div ref={listRef} role="listbox" aria-label="Open issues" className="mt-1.5 max-h-52 overflow-y-auto">
        {shown.map((issue, i) => (
          <button
            key={issue.number}
            type="button"
            role="option"
            aria-selected={i === active}
            onMouseEnter={() => setIndex(i)}
            onClick={() => onPick(issue)}
            className={`flex w-full items-baseline gap-2 rounded-md px-2.5 py-1.5 text-left text-[13px] transition-colors ${
              i === active ? "bg-[var(--bg-active)]" : ""
            }`}
          >
            <span className="shrink-0 font-mono text-[12px] tabular-nums text-[var(--accent-violet-text)]">
              #{issue.number}
            </span>
            <span className="min-w-0 flex-1 truncate text-[var(--text-primary)]">{issue.title}</span>
            {issue.labels.length > 0 && (
              <span className="max-w-[35%] shrink-0 truncate text-[11px] text-[var(--text-muted)]">
                {issue.labels.join(", ")}
              </span>
            )}
          </button>
        ))}
      </div>
      {error ? (
        <p className={NOTE}>{error}</p>
      ) : issues === null ? (
        <p className={NOTE}>Reading issues…</p>
      ) : (
        shown.length === 0 && <p className={NOTE}>{issues.length === 0 ? "No open issues" : "No matches"}</p>
      )}
    </div>
  );
}

import type { notes } from "../../../bridge/models";
import { formatHitDate } from "./notesFormat";
import { highlightTokens, type Highlighter } from "./notesHighlight";

interface NotesSearchResultsProps {
  query: string;
  hits: notes.SearchHit[];
  pending: boolean;
  error: unknown;
  highlighter: Highlighter;
  onPick: (hit: notes.SearchHit) => void;
}

const STATUS = "px-6 py-10 text-center text-[13px] text-[var(--text-muted)]";

export function NotesSearchResults({ query, hits, pending, error, highlighter, onPick }: NotesSearchResultsProps) {
  return (
    <div className="-mx-3 min-h-0 flex-1 overflow-y-auto pb-3">
      {pending && <div className={STATUS}>Searching…</div>}
      {!pending && error != null && (
        <div className={`${STATUS} text-[var(--accent-red)]`}>{`Search failed: ${String(error)}`}</div>
      )}
      {!pending && error == null && hits.length === 0 && <div className={STATUS}>No notes match “{query}”</div>}
      {hits.length > 0 && (
        <ul className="flex flex-col gap-0.5">
          {hits.map((hit) => (
            <li key={hit.id}>
              <button
                type="button"
                onClick={() => onPick(hit)}
                className="flex w-full flex-col gap-1 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-[var(--bg-hover)]/60"
              >
                <div className="flex items-center gap-2 text-[11px] text-[var(--text-muted)]">
                  <span className="rounded bg-[var(--bg-hover)] px-1.5 py-0.5 text-[var(--text-secondary)]">
                    {hit.chatTitle}
                  </span>
                  <span>{formatHitDate(hit.ts)}</span>
                </div>
                <div className="max-w-[720px] whitespace-pre-wrap break-words text-sm leading-relaxed text-[var(--text-primary)]">
                  {highlightTokens(hit.snippet, highlighter)}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

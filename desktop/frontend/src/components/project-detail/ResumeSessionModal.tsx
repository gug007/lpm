import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Modal } from "../ui/Modal";
import { SegmentedControl } from "../ui/SegmentedControl";
import { SearchIcon } from "../icons";
import { ResumeSessionRow } from "./ResumeSessionRow";
import { ResumeSessionEmpty } from "./ResumeSessionEmpty";
import { ResumeSessionFooter } from "./ResumeSessionFooter";
import { ResumeSessionSkeleton } from "./ResumeSessionSkeleton";
import {
  SESSION_PAGE_SIZE,
  filterByProvider,
  groupByDay,
  listAgentSessions,
  mergeSessionRows,
  type AgentSessionSummary,
  type SessionFilter,
  type SessionRow as Row,
} from "../../agentSessions";
import type { PersistedHistoryEntry } from "../../terminals";

interface ResumeSessionModalProps {
  projectName: string;
  history: PersistedHistoryEntry[];
  // Session id → the terminal id it's live in, so an open conversation is
  // offered as "go to tab" instead of a second agent on the same transcript.
  openSessions: Map<string, string>;
  hidden: ReadonlySet<string>;
  onResume: (row: Row) => void;
  onFocusTerminal: (terminalId: string) => void;
  onForget: (row: Row) => void;
  onRestoreHidden: () => void;
  onClose: () => void;
}

const LIST_ID = "resume-session-list";
const PAGE_ROWS = 10;
const STEP: Record<string, number | undefined> = {
  ArrowDown: 1,
  ArrowUp: -1,
  PageDown: PAGE_ROWS,
  PageUp: -PAGE_ROWS,
};

/** A row key is a DOM id too (aria-activedescendant), so it has to be tame. */
export const resumeRowDomId = (key: string) =>
  `resume-row-${key.replace(/[^a-zA-Z0-9_-]/g, "_")}`;

export function ResumeSessionModal({
  projectName,
  history,
  openSessions,
  hidden,
  onResume,
  onFocusTerminal,
  onForget,
  onRestoreHidden,
  onClose,
}: ResumeSessionModalProps) {
  const [searchInput, setSearchInput] = useState("");
  // Both halves of the round trip in one state: a search that also reset the
  // limit separately fired a full-limit scan whose result was thrown away.
  const [query, setQuery] = useState({ search: "", limit: SESSION_PAGE_SIZE });
  const [filter, setFilter] = useState<SessionFilter>("all");
  const [sessions, setSessions] = useState<AgentSessionSummary[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Typing narrows the on-disk scan too, so debounce the round trip rather than
  // firing one per keystroke.
  useEffect(() => {
    const timer = setTimeout(
      () =>
        setQuery((q) =>
          q.search === searchInput ? q : { search: searchInput, limit: SESSION_PAGE_SIZE },
        ),
      180,
    );
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listAgentSessions(projectName, query.limit, query.search)
      .then((page) => {
        if (cancelled) return;
        setSessions(page.sessions);
        setHasMore(page.hasMore);
        setFailed(false);
      })
      // A project whose agents run on another machine has no transcripts to
      // read here; its closed tabs still list, and there is no more to load.
      .catch(() => {
        if (cancelled) return;
        setSessions([]);
        setHasMore(false);
        setFailed(true);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [projectName, query]);

  // Counts come from the unfiltered merge, so picking a provider can't change
  // the numbers on the control that picked it.
  const merged = useMemo(
    () =>
      mergeSessionRows({
        history,
        sessions: sessions ?? [],
        open: openSessions,
        search: query.search,
        hidden,
      }),
    [history, sessions, openSessions, query.search, hidden],
  );
  const counts = useMemo(
    () => ({
      all: merged.length,
      claude: merged.filter((row) => row.provider === "claude").length,
      codex: merged.filter((row) => row.provider === "codex").length,
    }),
    [merged],
  );
  const rows = useMemo(() => filterByProvider(merged, filter), [merged, filter]);
  const groups = useMemo(() => groupByDay(rows), [rows]);

  // Keep a selection on the list at all times so ↑/↓/↵ always have a target.
  useEffect(() => {
    setActiveKey((current) =>
      current && rows.some((row) => row.key === current) ? current : (rows[0]?.key ?? null),
    );
  }, [rows]);

  const activeRow = useMemo(
    () => rows.find((row) => row.key === activeKey) ?? null,
    [rows, activeKey],
  );

  // WebKit re-runs hover hit-testing while the list scrolls, so arrowing past
  // the fold drags a new row under a resting cursor and its mouseenter would
  // take the selection back. Hover only counts after the pointer really moves.
  const pointerMoved = useRef(true);
  const handleHover = useCallback((key: string) => {
    if (pointerMoved.current) setActiveKey(key);
  }, []);

  const pick = useCallback(
    (row: Row) => {
      if (row.openInTerminalId) onFocusTerminal(row.openInTerminalId);
      else onResume(row);
    },
    [onFocusTerminal, onResume],
  );

  const hide = useCallback(
    (row: Row) => {
      // Land on the neighbour: the row under the cursor is gone, and jumping to
      // the top of the list loses the user's place.
      const index = rows.findIndex((r) => r.key === row.key);
      setActiveKey((rows[index + 1] ?? rows[index - 1])?.key ?? null);
      onForget(row);
    },
    [rows, onForget],
  );

  const move = useCallback(
    (delta: number) => {
      if (rows.length === 0) return;
      pointerMoved.current = false;
      const current = rows.findIndex((row) => row.key === activeKey);
      const next = Math.max(0, Math.min(rows.length - 1, (current < 0 ? 0 : current) + delta));
      setActiveKey(rows[next].key);
      document.getElementById(resumeRowDomId(rows[next].key))?.scrollIntoView({ block: "nearest" });
    },
    [rows, activeKey],
  );

  const loadMore = useCallback(
    () => setQuery((q) => ({ ...q, limit: q.limit + SESSION_PAGE_SIZE * 2 })),
    [],
  );

  const pending = searchInput !== query.search;
  const canHide = activeRow !== null && activeRow.openInTerminalId === undefined;

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.nativeEvent.isComposing) return;
    const step = STEP[e.key];
    if (step !== undefined) {
      e.preventDefault();
      move(step);
      return;
    }
    if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      move(e.key === "Home" ? -Infinity : Infinity);
      return;
    }
    // The search field holds focus throughout, so hiding can only claim a chord
    // that isn't already text editing: bare ⌫ types, ⌥⌫ deletes a word.
    if ((e.key === "Backspace" || e.key === "Delete") && e.metaKey) {
      if (activeRow && canHide) {
        e.preventDefault();
        hide(activeRow);
      }
      return;
    }
    // Enter only means "resume" while typing a search; on a focused Close
    // button it has to close the modal.
    if (e.key !== "Enter" || e.target !== inputRef.current) return;
    e.preventDefault();
    // The visible rows still answer the previous query — resolve it first so a
    // fast typist can't launch whatever the stale list had selected.
    if (pending) setQuery({ search: searchInput, limit: SESSION_PAGE_SIZE });
    else if (activeRow) pick(activeRow);
  };

  // Escape clears a live search before it closes the modal. Modal binds Escape
  // on document in the bubble phase, so this has to run in capture.
  useEffect(() => {
    if (!searchInput) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setSearchInput("");
      setQuery({ search: "", limit: SESSION_PAGE_SIZE });
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [searchInput]);

  const filterOptions = useMemo(
    () => [
      { value: "all" as SessionFilter, label: "All", count: counts.all },
      { value: "claude" as SessionFilter, label: "Claude", count: counts.claude },
      { value: "codex" as SessionFilter, label: "Codex", count: counts.codex },
    ],
    [counts],
  );

  const searching = query.search.trim().length > 0;
  const stale = loading && sessions !== null;
  const empty = rows.length === 0 && !loading;
  const skeleton = sessions === null || (stale && rows.length === 0);
  // Raising the limit widens the scan; it doesn't page through a fixed list.
  const moreLabel = loading ? "Loading…" : searching ? "Search further back" : "Show older sessions";
  const showFilter = (counts.claude > 0 && counts.codex > 0) || filter !== "all";
  const hiddenCount = hidden.size;

  return (
    <Modal
      open
      onClose={onClose}
      zIndexClassName="z-[60]"
      contentClassName="flex h-[min(70vh,42rem)] w-[46rem] max-w-[92vw] flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] shadow-xl"
    >
      <div onKeyDown={onKeyDown} className="flex min-h-0 flex-1 flex-col">
        <div className="px-5 pt-5">
          <h3 className="text-base font-semibold text-[var(--text-primary)]">Resume session</h3>
          <p className="mt-1 text-[12px] text-[var(--text-secondary)]">
            Continue any past agent conversation from this project in a new tab.
          </p>
        </div>

        <div className="flex items-center gap-2 px-5 pb-3 pt-3.5">
          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-[var(--border)] px-2.5 py-1.5 focus-within:border-[var(--accent-blue)]">
            <span className="text-[var(--text-muted)] [&>svg]:h-3.5 [&>svg]:w-3.5">
              <SearchIcon />
            </span>
            <input
              ref={inputRef}
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search sessions"
              aria-label="Search sessions"
              role="combobox"
              aria-expanded
              aria-controls={LIST_ID}
              aria-activedescendant={activeKey ? resumeRowDomId(activeKey) : undefined}
              data-text-scope=""
              spellCheck={false}
              autoFocus
              className="w-full bg-transparent text-[13px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
            />
          </div>
          {showFilter && (
            <SegmentedControl
              value={filter}
              options={filterOptions}
              onChange={setFilter}
              ariaLabel="Filter by agent"
              className="shrink-0"
            />
          )}
        </div>

        <span className="sr-only" role="status" aria-live="polite">
          {loading ? "Searching" : `${rows.length} sessions`}
        </span>

        <div
          ref={listRef}
          id={LIST_ID}
          role="listbox"
          aria-label="Past sessions"
          aria-busy={loading}
          onMouseDown={(e) => e.preventDefault()}
          onMouseMove={() => {
            pointerMoved.current = true;
          }}
          className="min-h-0 flex-1 overflow-y-auto border-t border-[var(--border)] px-2 py-1.5"
        >
          {skeleton ? (
            <ResumeSessionSkeleton />
          ) : empty ? (
            <ResumeSessionEmpty
              searching={searching}
              term={query.search.trim()}
              provider={filter}
              failed={failed}
              hiddenCount={hiddenCount}
              onShowAll={() => setFilter("all")}
              onMore={hasMore ? loadMore : undefined}
              moreLabel={moreLabel}
            />
          ) : (
            // Dimmed, not replaced: the rows on screen still answer the last
            // query, and blanking them for one round trip is worse. A listbox
            // owns options through groups only, so the day wrappers say so.
            <div role="presentation" className={`transition-opacity ${stale ? "opacity-50" : ""}`}>
              {groups.map((group) => (
                <div key={group.label} role="group" aria-label={group.label}>
                  <div aria-hidden className="sticky top-0 z-10 flex h-8 items-end bg-[var(--bg-primary)] px-2.5 pb-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                    {group.label}
                  </div>
                  {group.rows.map((row) => (
                    <ResumeSessionRow
                      key={row.key}
                      row={row}
                      active={row.key === activeKey}
                      domId={resumeRowDomId(row.key)}
                      onHover={handleHover}
                      onPick={pick}
                      onForget={row.openInTerminalId === undefined ? hide : undefined}
                    />
                  ))}
                </div>
              ))}
            </div>
          )}
          {hasMore && !skeleton && !empty && (
            <div className="px-2.5 py-3 text-center">
              <button
                type="button"
                disabled={loading}
                onClick={loadMore}
                className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-[11px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-blue)] disabled:opacity-50"
              >
                {moreLabel}
              </button>
            </div>
          )}
        </div>

        <ResumeSessionFooter
          picksOpenTab={activeRow?.openInTerminalId !== undefined}
          canHide={canHide}
          hiddenCount={hiddenCount}
          onRestoreHidden={onRestoreHidden}
          onClose={onClose}
        />
      </div>
    </Modal>
  );
}

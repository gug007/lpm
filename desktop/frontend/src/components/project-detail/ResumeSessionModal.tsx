import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Modal } from "../ui/Modal";
import { HistoryIcon, SearchIcon } from "../icons";
import { ResumeSessionRow } from "./ResumeSessionRow";
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
  onResume: (row: Row) => void;
  onFocusTerminal: (terminalId: string) => void;
  onForget: (row: Row) => void;
  onClose: () => void;
}

const FILTERS: { id: SessionFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "claude", label: "Claude" },
  { id: "codex", label: "Codex" },
];

export function ResumeSessionModal({
  projectName,
  history,
  openSessions,
  onResume,
  onFocusTerminal,
  onForget,
  onClose,
}: ResumeSessionModalProps) {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<SessionFilter>("all");
  const [limit, setLimit] = useState(SESSION_PAGE_SIZE);
  const [sessions, setSessions] = useState<AgentSessionSummary[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Typing narrows the on-disk scan too, so debounce the round trip rather than
  // firing one per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput), 180);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // A new search starts from the first page again.
  useEffect(() => setLimit(SESSION_PAGE_SIZE), [search]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listAgentSessions(projectName, limit, search)
      .then((page) => {
        if (cancelled) return;
        setSessions(page.sessions);
        setHasMore(page.hasMore);
      })
      // A project whose agents run on another machine has no transcripts to
      // read here; its closed tabs still list.
      .catch(() => !cancelled && setSessions([]))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [projectName, limit, search]);

  const rows = useMemo(
    () =>
      filterByProvider(
        mergeSessionRows({ history, sessions: sessions ?? [], open: openSessions, search }),
        filter,
      ),
    [history, sessions, openSessions, search, filter],
  );
  const groups = useMemo(() => groupByDay(rows), [rows]);

  // Keep a selection on the list at all times so ↑/↓/↵ always have a target.
  useEffect(() => {
    setActiveKey((current) =>
      current && rows.some((row) => row.key === current) ? current : (rows[0]?.key ?? null),
    );
  }, [rows]);

  const pick = useCallback(
    (row: Row) => {
      if (row.openInTerminalId) onFocusTerminal(row.openInTerminalId);
      else onResume(row);
    },
    [onFocusTerminal, onResume],
  );

  const move = useCallback(
    (delta: number) => {
      if (rows.length === 0) return;
      const current = rows.findIndex((row) => row.key === activeKey);
      const next = Math.max(0, Math.min(rows.length - 1, (current < 0 ? 0 : current) + delta));
      setActiveKey(rows[next].key);
      listRef.current
        ?.querySelector(`[data-row-key="${CSS.escape(rows[next].key)}"]`)
        ?.scrollIntoView({ block: "nearest" });
    },
    [rows, activeKey],
  );

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      move(1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      move(-1);
    } else if (e.key === "Enter") {
      const row = rows.find((r) => r.key === activeKey);
      if (row) {
        e.preventDefault();
        pick(row);
      }
    }
  };

  const empty = !loading && rows.length === 0;

  return (
    <Modal
      open
      onClose={onClose}
      zIndexClassName="z-[60]"
      contentClassName="flex h-[70vh] w-[40rem] max-w-[92vw] flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] shadow-xl"
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
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search by title, prompt or branch"
              spellCheck={false}
              autoFocus
              className="w-full bg-transparent text-[13px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
            />
          </div>
          <div className="flex shrink-0 items-center gap-0.5 rounded-lg border border-[var(--border)] p-0.5">
            {FILTERS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilter(tab.id)}
                className={`h-6 rounded-md px-2.5 text-[11px] font-medium transition-colors ${
                  filter === tab.id
                    ? "bg-[var(--bg-active)] text-[var(--text-primary)]"
                    : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div
          ref={listRef}
          className="min-h-0 flex-1 overflow-y-auto border-t border-[var(--border)] p-1.5"
        >
          {sessions === null && loading ? (
            <ListSkeleton />
          ) : empty ? (
            <EmptyMessage searching={search.trim().length > 0} />
          ) : (
            <>
              {groups.map((group) => (
                <div key={group.label}>
                  <div className="sticky top-0 z-10 bg-[var(--bg-primary)] px-2.5 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                    {group.label}
                  </div>
                  {group.rows.map((row) => (
                    <div key={row.key} data-row-key={row.key}>
                      <ResumeSessionRow
                        row={row}
                        active={row.key === activeKey}
                        onHover={() => setActiveKey(row.key)}
                        onPick={() => pick(row)}
                        onForget={row.remembered ? () => onForget(row) : undefined}
                      />
                    </div>
                  ))}
                </div>
              ))}
              {hasMore && (
                <div className="px-2.5 py-3 text-center">
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => setLimit((n) => n + SESSION_PAGE_SIZE * 2)}
                    className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-[11px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] disabled:opacity-50"
                  >
                    {loading ? "Loading…" : "Show older sessions"}
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-[var(--border)] px-5 py-3">
          <span className="text-[11px] text-[var(--text-muted)]">
            <Kbd>↑</Kbd> <Kbd>↓</Kbd> to browse · <Kbd>↵</Kbd> to resume
          </span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)]"
          >
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
}

function Kbd({ children }: { children: string }) {
  return (
    <kbd className="rounded border border-[var(--border)] bg-[var(--bg-secondary)] px-1 py-px font-mono text-[10px] text-[var(--text-secondary)]">
      {children}
    </kbd>
  );
}

function ListSkeleton() {
  return (
    <div className="animate-pulse p-1">
      {Array.from({ length: 7 }, (_, i) => (
        <div key={i} className="flex items-center gap-3 px-1.5 py-2.5">
          <div className="h-7 w-7 shrink-0 rounded-md bg-[var(--bg-active)]" />
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <div className="h-2.5 rounded bg-[var(--bg-active)]" style={{ width: `${55 - i * 4}%` }} />
            <div className="h-2 rounded bg-[var(--bg-active)]" style={{ width: `${80 - i * 6}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyMessage({ searching }: { searching: boolean }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-1.5 px-6 text-center">
      <span className="grid h-9 w-9 place-items-center rounded-full bg-[var(--bg-secondary)] text-[var(--text-muted)] [&>svg]:h-4 [&>svg]:w-4">
        <HistoryIcon />
      </span>
      <span className="text-xs font-medium text-[var(--text-secondary)]">
        {searching ? "No matching sessions" : "No sessions yet"}
      </span>
      <span className="max-w-[320px] text-[11px] leading-relaxed text-[var(--text-muted)]">
        {searching
          ? "Try a different search, or show older sessions first."
          : "Conversations you have with Claude Code or Codex in this project show up here, ready to pick up again."}
      </span>
    </div>
  );
}

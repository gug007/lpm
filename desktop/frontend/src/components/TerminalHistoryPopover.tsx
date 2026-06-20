import { useEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  clearHistory,
  queryHistory,
  toggleFavorite,
  HISTORY_PAGE_SIZE,
  MESSAGE_HISTORY_KEY,
  type HistoryCursor,
  type HistoryFilter,
  type HistoryMessage,
  type HistoryScope,
} from "../store/messageHistory";
import { relativeTime } from "../relativeTime";
import { SearchIcon, StarIcon } from "./icons";

interface TerminalHistoryPopoverProps {
  containerRef: RefObject<HTMLDivElement | null>;
  style: CSSProperties | undefined;
  terminalId: string;
  projectName: string;
  terminalLabel: string;
  onPick: (text: string) => void;
}

export function TerminalHistoryPopover({
  containerRef,
  style,
  terminalId,
  projectName,
  terminalLabel,
  onPick,
}: TerminalHistoryPopoverProps) {
  const [scope, setScope] = useState<HistoryScope>("terminal");
  const [favOnly, setFavOnly] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [confirmingClear, setConfirmingClear] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Debounce typing so we don't fire a query (and re-key the cache) per keystroke.
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 180);
    return () => clearTimeout(t);
  }, [searchInput]);

  const filter: HistoryFilter = {
    scope,
    terminalId,
    projectName,
    terminalLabel,
    favoritesOnly: favOnly,
    search: search.trim(),
  };

  const query = useInfiniteQuery({
    queryKey: [MESSAGE_HISTORY_KEY, filter],
    queryFn: ({ pageParam }) => queryHistory(filter, pageParam),
    initialPageParam: null as HistoryCursor | null,
    getNextPageParam: (last) =>
      last.length === HISTORY_PAGE_SIZE
        ? { at: last[last.length - 1].at, seq: last[last.length - 1].seq }
        : undefined,
    // Collect abandoned search/scope permutations quickly instead of the 5-min default.
    gcTime: 60_000,
  });

  const items = useMemo(() => query.data?.pages.flat() ?? [], [query.data]);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 54,
    overscan: 8,
  });
  const virtualItems = virtualizer.getVirtualItems();

  // Load the next page when the last row scrolls into view.
  const last = virtualItems[virtualItems.length - 1];
  useEffect(() => {
    if (last && last.index >= items.length - 1 && query.hasNextPage && !query.isFetchingNextPage) {
      void query.fetchNextPage();
    }
  }, [last, items.length, query.hasNextPage, query.isFetchingNextPage, query.fetchNextPage]);

  const onScopeChange = (next: HistoryScope) => {
    setScope(next);
    setConfirmingClear(false);
  };

  // Clear wipes the whole scope (favorites are kept by the backend). It's only
  // offered on an unfiltered view, so it can't be misread as "clear these rows".
  const canClear = !search.trim() && !favOnly && items.some((m) => !m.favorite);
  const clear = () => {
    clearHistory(filter);
    setConfirmingClear(false);
  };

  const emptyLabel = favOnly
    ? "No favorites yet"
    : search.trim()
      ? "No matching messages"
      : "Nothing sent yet";

  return (
    <div
      ref={containerRef}
      role="dialog"
      aria-label="Message history"
      style={style}
      className="z-[9999] flex flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)] shadow-[0_16px_48px_-12px_rgba(0,0,0,0.55)]"
    >
      <div className="flex items-center gap-2.5 px-3.5 py-3">
        <span className="text-[var(--text-muted)]">
          <SearchIcon />
        </span>
        <input
          value={searchInput}
          onChange={(e) => {
            setSearchInput(e.target.value);
            setConfirmingClear(false);
          }}
          placeholder="Search history"
          spellCheck={false}
          autoFocus
          className="w-full bg-transparent text-[13px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
        />
      </div>

      <div className="flex items-center gap-1 px-2.5 pb-2">
        <div className="flex items-center gap-0.5">
          <ScopeTab active={scope === "terminal"} onClick={() => onScopeChange("terminal")}>
            This terminal
          </ScopeTab>
          <ScopeTab active={scope === "all"} onClick={() => onScopeChange("all")}>
            All terminals
          </ScopeTab>
        </div>
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => {
            setFavOnly((v) => !v);
            setConfirmingClear(false);
          }}
          aria-pressed={favOnly}
          title={favOnly ? "Show all" : "Show favorites"}
          className={`flex h-6 w-6 items-center justify-center rounded-md transition-colors ${
            favOnly
              ? "text-amber-400"
              : "text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)]"
          }`}
        >
          <StarIcon filled={favOnly} size={13} />
        </button>
        <button
          type="button"
          onClick={() => (confirmingClear ? clear() : setConfirmingClear(true))}
          disabled={!canClear}
          className={`shrink-0 rounded-md px-2 py-1 text-[11px] font-medium transition-colors disabled:opacity-0 ${
            confirmingClear
              ? "text-[var(--accent-red)]"
              : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
          }`}
        >
          {confirmingClear ? "Clear?" : "Clear"}
        </button>
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto border-t border-[var(--border)] p-1.5">
        {items.length === 0 ? (
          <div className="px-3 py-10 text-center text-xs text-[var(--text-muted)]">
            {query.isLoading ? "Loading…" : emptyLabel}
          </div>
        ) : (
          <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
            {virtualItems.map((vi) => {
              const message = items[vi.index];
              return (
                <div
                  key={message.id}
                  data-index={vi.index}
                  ref={virtualizer.measureElement}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    transform: `translateY(${vi.start}px)`,
                  }}
                >
                  <HistoryRow message={message} showSource={scope === "all"} onPick={onPick} />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function ScopeTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
        active
          ? "bg-[var(--bg-active)] text-[var(--text-primary)]"
          : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
      }`}
    >
      {children}
    </button>
  );
}

function HistoryRow({
  message,
  showSource,
  onPick,
}: {
  message: HistoryMessage;
  showSource: boolean;
  onPick: (text: string) => void;
}) {
  return (
    <div className="group flex items-center gap-1 rounded-lg pl-2.5 pr-1.5 transition-colors hover:bg-[var(--bg-hover)]">
      <button
        type="button"
        onClick={() => onPick(message.text)}
        className="flex min-w-0 flex-1 flex-col gap-0.5 py-2 text-left"
      >
        <span className="line-clamp-2 whitespace-pre-wrap break-words text-[13px] leading-snug text-[var(--text-primary)] [overflow-wrap:anywhere]">
          {message.text}
        </span>
        {showSource && (
          <span className="truncate text-[10px] text-[var(--text-muted)]">
            {message.projectName} · {message.terminalLabel}
          </span>
        )}
      </button>
      <span className="shrink-0 text-[10px] tabular-nums text-[var(--text-muted)]">
        {relativeTime(Math.floor(message.at / 1000))}
      </span>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          toggleFavorite(message.id);
        }}
        aria-pressed={message.favorite}
        title={message.favorite ? "Remove favorite" : "Mark as favorite"}
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-all ${
          message.favorite
            ? "text-amber-400"
            : "text-[var(--text-muted)] opacity-0 hover:text-[var(--text-secondary)] group-hover:opacity-100"
        }`}
      >
        <StarIcon filled={message.favorite} size={13} />
      </button>
    </div>
  );
}

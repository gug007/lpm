import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  clearHistory,
  deleteFolder,
  deleteMessage,
  listFolders,
  queryHistory,
  toggleFavorite,
  COLLECTION_ALL,
  COLLECTION_DRAFTS,
  COLLECTION_FAVORITES,
  FOLDERS_KEY,
  HISTORY_PAGE_SIZE,
  MESSAGE_HISTORY_KEY,
  type Folder,
  type HistoryCursor,
  type HistoryFilter,
  type HistoryMessage,
  type HistoryScope,
} from "../store/messageHistory";
import { relativeTime } from "../relativeTime";
import { isImagePath, splitByImageTokens } from "./composerEditor";
import { FolderIcon, PencilIcon, PlusIcon, SearchIcon, SendIcon, StarIcon, TrashIcon, XIcon } from "./icons";
import { MessageFolderMenu } from "./MessageFolderMenu";
import { MessageFileChip } from "./MessageFileChip";
import { MessageImageChip } from "./MessageImageChip";
import { NewFolderInput } from "./NewFolderInput";

interface TerminalHistoryPopoverProps {
  containerRef: RefObject<HTMLDivElement | null>;
  style: CSSProperties | undefined;
  terminalId: string;
  projectName: string;
  terminalLabel: string;
  onPick: (text: string, images: Record<string, string>) => void;
  // When set, each row gains a one-click "send to terminal" action.
  onSend?: (text: string, images: Record<string, string>) => void;
}

export function TerminalHistoryPopover({
  containerRef,
  style,
  terminalId,
  projectName,
  terminalLabel,
  onPick,
  onSend,
}: TerminalHistoryPopoverProps) {
  const [scope, setScope] = useState<HistoryScope>("project");
  const [collection, setCollection] = useState(COLLECTION_ALL);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [folderMenu, setFolderMenu] = useState<{ message: HistoryMessage; anchor: DOMRect } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const folders = useQuery({ queryKey: [FOLDERS_KEY], queryFn: listFolders }).data ?? [];

  // Debounce typing so we don't fire a query (and re-key the cache) per keystroke.
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 180);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Every collection can be narrowed to this project or widened to all — the
  // scope toggle shows for all of them. Only the default differs (see
  // selectCollection): "All" opens project-scoped, the curated collections
  // (Favorites, Drafts, folders) open across every project.
  const filter: HistoryFilter = useMemo(
    () => ({ scope, terminalId, projectName, terminalLabel, collection, search: search.trim() }),
    [scope, terminalId, projectName, terminalLabel, collection, search],
  );

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
    estimateSize: () => 48,
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

  // Picking a collection resets the scope to that collection's default: the
  // unfiltered "All" view opens on the current project, while the curated
  // collections (Favorites, Drafts, folders) open across all projects. The user
  // can still flip the toggle either way afterward.
  const selectCollection = (next: string) => {
    setCollection(next);
    setScope(next === COLLECTION_ALL ? "project" : "all");
    setConfirmingClear(false);
  };

  const openFolderMenu = useCallback(
    (message: HistoryMessage, anchor: DOMRect) => setFolderMenu({ message, anchor }),
    [],
  );

  // Clear only removes transient history — favorited and foldered messages are
  // kept — so it's offered solely on the unfiltered "All" view.
  const canClear =
    !search.trim() &&
    collection === COLLECTION_ALL &&
    items.some((m) => !m.favorite && !m.folderId && !m.isDraft);
  const clear = () => {
    clearHistory(filter);
    setConfirmingClear(false);
  };

  const emptyLabel =
    collection === COLLECTION_FAVORITES
      ? "No favorites yet"
      : collection === COLLECTION_DRAFTS
        ? "No drafts yet"
        : collection !== COLLECTION_ALL
          ? "Folder is empty"
          : search.trim()
            ? "No matching messages"
            : "Nothing sent yet";

  return (
    <div
      ref={containerRef}
      role="dialog"
      aria-label="Message history"
      data-history-overlay
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

      <div className="flex items-center gap-2 px-3.5 pb-2.5">
        <div className="flex shrink-0 items-center gap-0.5 rounded-full bg-[var(--bg-secondary)] p-0.5">
          <ScopeTab active={scope === "project"} onClick={() => onScopeChange("project")}>
            This project
          </ScopeTab>
          <ScopeTab active={scope === "all"} onClick={() => onScopeChange("all")}>
            All projects
          </ScopeTab>
        </div>
        <div className="min-w-0 flex-1" />
        <CollectionBar
          collection={collection}
          folders={folders}
          onSelect={selectCollection}
          onDeleteFolder={(id) => {
            deleteFolder(id);
            if (collection === id) selectCollection(COLLECTION_ALL);
          }}
        />
        <span
          aria-hidden
          className={`h-4 w-px shrink-0 bg-[var(--border)] transition-opacity ${canClear ? "" : "opacity-0"}`}
        />
        <button
          type="button"
          onClick={() => (confirmingClear ? clear() : setConfirmingClear(true))}
          disabled={!canClear}
          className={`shrink-0 rounded-md px-2 py-1 text-[11px] font-medium transition-colors disabled:opacity-0 ${
            confirmingClear
              ? "text-[var(--accent-red)] hover:bg-[var(--accent-red)]/10"
              : "text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)]"
          }`}
        >
          {confirmingClear ? "Clear?" : "Clear"}
        </button>
      </div>

      <div ref={scrollRef} data-history-scroll className="min-h-0 flex-1 overflow-y-auto border-t border-[var(--border)] p-1.5">
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
                  <HistoryRow
                    message={message}
                    source={scope === "all" ? "full" : "terminal"}
                    onPick={onPick}
                    onSend={onSend}
                    onOpenFolderMenu={openFolderMenu}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>

      {folderMenu && (
        <MessageFolderMenu
          anchor={folderMenu.anchor}
          message={folderMenu.message}
          folders={folders}
          onClose={() => setFolderMenu(null)}
        />
      )}
    </div>
  );
}

function CollectionBar({
  collection,
  folders,
  onSelect,
  onDeleteFolder,
}: {
  collection: string;
  folders: Folder[];
  onSelect: (c: string) => void;
  onDeleteFolder: (id: string) => void;
}) {
  const [creating, setCreating] = useState(false);

  return (
    <div className="flex min-w-0 items-center gap-1 overflow-x-auto [scrollbar-width:none]">
      <Chip active={collection === COLLECTION_ALL} onClick={() => onSelect(COLLECTION_ALL)}>
        All
      </Chip>
      <Chip
        active={collection === COLLECTION_FAVORITES}
        onClick={() => onSelect(COLLECTION_FAVORITES)}
        icon={<StarIcon filled={collection === COLLECTION_FAVORITES} size={11} />}
      >
        Favorites
      </Chip>
      <Chip
        active={collection === COLLECTION_DRAFTS}
        onClick={() => onSelect(COLLECTION_DRAFTS)}
        icon={<PencilIcon size={11} />}
      >
        Drafts
      </Chip>
      {folders.map((f) => (
        <Chip
          key={f.id}
          active={collection === f.id}
          onClick={() => onSelect(f.id)}
          icon={<FolderIcon />}
          count={f.count}
          onDelete={() => onDeleteFolder(f.id)}
        >
          {f.name}
        </Chip>
      ))}
      {creating ? (
        <NewFolderInput
          className="h-[26px] w-28 shrink-0 rounded-full border border-[var(--border)] bg-transparent px-2.5 text-[11px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
          onCreated={(folder) => {
            setCreating(false);
            onSelect(folder.id);
          }}
          onCancel={() => setCreating(false)}
        />
      ) : (
        <button
          type="button"
          onClick={() => setCreating(true)}
          title="New folder"
          className="flex h-[26px] shrink-0 items-center justify-center rounded-full px-2 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
        >
          <PlusIcon />
        </button>
      )}
    </div>
  );
}

// A filter pill. With onDelete it gains a hover delete button + count badge
// (folders); without, it's a plain pill (All / Favorites).
function Chip({
  active,
  onClick,
  icon,
  count,
  onDelete,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon?: ReactNode;
  count?: number;
  onDelete?: () => void;
  children: ReactNode;
}) {
  const tone = active
    ? "bg-[var(--bg-active)] text-[var(--text-primary)]"
    : "text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)]";
  const label = (
    <>
      {icon}
      <span className="max-w-[140px] truncate">{children}</span>
      {count !== undefined && count > 0 && <span className="opacity-60">{count}</span>}
    </>
  );
  if (!onDelete) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`flex h-[26px] shrink-0 items-center gap-1 rounded-full px-2.5 text-[11px] font-medium transition-colors ${tone}`}
      >
        {label}
      </button>
    );
  }
  return (
    <div
      className={`group flex h-[26px] shrink-0 items-center gap-1 rounded-full pl-2.5 pr-1.5 text-[11px] font-medium transition-colors ${tone}`}
    >
      <button type="button" onClick={onClick} className="flex items-center gap-1">
        {label}
      </button>
      <button
        type="button"
        onClick={onDelete}
        title="Delete folder"
        className="flex h-4 w-4 items-center justify-center rounded opacity-0 transition-opacity hover:text-[var(--accent-red)] group-hover:opacity-100"
      >
        <XIcon />
      </button>
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
          ? "bg-[var(--bg-active)] text-[var(--text-primary)] shadow-[0_1px_2px_rgba(0,0,0,0.25)]"
          : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
      }`}
    >
      {children}
    </button>
  );
}

// Renders real "[Image #N]" tokens (those with a mapped path) as compact chips
// matching the composer — an image avatar for an image, a file glyph + basename
// for any other attachment; a token the user typed literally (no mapped path)
// stays text, mirroring how loadFromHistory rebuilds the field.
function MessageText({ text, images }: { text: string; images: Record<string, string> }) {
  return (
    <>
      {splitByImageTokens(text).map((seg, i) => {
        if (seg.image === null || !images[seg.image]) return <span key={i}>{seg.text}</span>;
        const path = images[seg.image];
        return isImagePath(path) ? (
          <MessageImageChip key={i} index={seg.image} path={path} />
        ) : (
          <MessageFileChip key={i} path={path} />
        );
      })}
    </>
  );
}

// Memoized so unrelated popover state (search, folder menu, confirm-clear)
// doesn't re-render every visible row; props are stable per message.
const HistoryRow = memo(function HistoryRow({
  message,
  source,
  onPick,
  onSend,
  onOpenFolderMenu,
}: {
  message: HistoryMessage;
  source: "terminal" | "full";
  onPick: (text: string, images: Record<string, string>) => void;
  onSend?: (text: string, images: Record<string, string>) => void;
  onOpenFolderMenu: (message: HistoryMessage, anchor: DOMRect) => void;
}) {
  return (
    <div className="group relative flex items-start gap-2 rounded-lg pl-2.5 pr-2 transition-colors hover:bg-[var(--bg-hover)]">
      <button
        type="button"
        onClick={() => onPick(message.text, message.images)}
        className="flex min-w-0 flex-1 flex-col gap-0.5 py-1.5 text-left"
      >
        <span className="line-clamp-2 whitespace-pre-wrap break-words text-[13px] leading-snug text-[var(--text-primary)] [overflow-wrap:anywhere]">
          {message.isDraft && (
            <span className="mr-1.5 rounded bg-[var(--accent-blue)]/15 px-1 py-px align-[1px] text-[9px] font-semibold uppercase tracking-wide text-[var(--accent-blue)]">
              Draft
            </span>
          )}
          <MessageText text={message.text} images={message.images} />
        </span>
        <span className="truncate text-[10px] text-[var(--text-muted)]">
          {source === "full" ? `${message.projectName} · ${message.terminalLabel}` : message.terminalLabel}
        </span>
      </button>

      {/* Rest state: persistent folder/star status glyphs + timestamp, top-aligned
          to the first line so time never floats mid-row on a 2-line message. Stays
          in flow (only opacity toggles) so the body's flex width is identical
          whether hovered or not — no reflow. */}
      <div className="pointer-events-none flex shrink-0 items-center gap-1.5 pt-2 transition-opacity group-hover:opacity-0">
        {message.folderId && (
          <span className="text-[var(--accent-blue)] [&>svg]:h-3 [&>svg]:w-3">
            <FolderIcon />
          </span>
        )}
        {message.favorite && (
          <span className="text-amber-400">
            <StarIcon filled size={12} />
          </span>
        )}
        <span className="text-[10px] leading-none tabular-nums text-[var(--text-muted)]">
          {relativeTime(Math.floor(message.at / 1000))}
        </span>
      </div>

      {/* Hover state: the action toolbar overlays the right edge — absolute, so it
          reserves no width and causes no reflow. A left gradient dissolves long
          text sliding under it; both the fade and the strip reference --bg-hover
          (the row's own hover tint) so the seam vanishes in light + dark. The
          container is pointer-events-none; only the buttons re-enable hits on
          hover, so at rest clicks fall straight through to the row body (onPick). */}
      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center opacity-0 transition-opacity group-hover:opacity-100">
        <div className="h-full w-10 bg-gradient-to-l from-[var(--bg-hover)] to-transparent" />
        <div className="flex h-full items-center gap-0.5 bg-[var(--bg-hover)] pr-2">
          {onSend && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onSend(message.text, message.images);
              }}
              title="Send to terminal"
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[var(--text-muted)] transition-colors hover:bg-[var(--accent-blue)]/15 hover:text-[var(--accent-blue)] group-hover:pointer-events-auto [&>svg]:h-3.5 [&>svg]:w-3.5"
            >
              <SendIcon />
            </button>
          )}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenFolderMenu(message, e.currentTarget.getBoundingClientRect());
            }}
            title="Move to folder"
            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-colors group-hover:pointer-events-auto ${
              message.folderId
                ? "text-[var(--accent-blue)] hover:bg-[var(--accent-blue)]/15"
                : "text-[var(--text-muted)] hover:bg-[var(--bg-active)] hover:text-[var(--text-secondary)]"
            }`}
          >
            <FolderIcon />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              toggleFavorite(message.id);
            }}
            aria-pressed={message.favorite}
            title={message.favorite ? "Remove favorite" : "Mark as favorite"}
            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-colors group-hover:pointer-events-auto ${
              message.favorite
                ? "text-amber-400 hover:bg-amber-400/15"
                : "text-[var(--text-muted)] hover:bg-[var(--bg-active)] hover:text-[var(--text-secondary)]"
            }`}
          >
            <StarIcon filled={message.favorite} size={13} />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              deleteMessage(message.id);
            }}
            title="Delete message"
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[var(--text-muted)] transition-colors hover:bg-[var(--accent-red)]/10 hover:text-[var(--accent-red)] group-hover:pointer-events-auto"
          >
            <TrashIcon size={13} />
          </button>
        </div>
      </div>
    </div>
  );
});

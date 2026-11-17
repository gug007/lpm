import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MessageSquare } from "lucide-react";
import { toast } from "../notifications/toast";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from "@tanstack/react-query";
import {
  NotesAddMessage,
  NotesCreateChat,
  NotesDeleteChat,
  NotesDeleteMessage,
  NotesEditMessage,
  NotesListChats,
  NotesListMessages,
  NotesReadFileAsInput,
  NotesRenameChat,
  NotesSearch,
} from "../../bridge/commands";
import { registerFileDropHandler } from "../fileDrop";
import { main, notes } from "../../bridge/models";
import { SearchIcon } from "./icons";
import { base64ToBytes, bytesToBase64 } from "../download";
import { ChatList } from "./ChatList";
import { BTN_SECONDARY } from "./ui/buttons";
import { EmptyState } from "./ui/EmptyState";
import type { PageBack } from "./ui/PageHeader";
import { ProjectSubpage, SUBPAGE_COLUMN } from "./project-detail/ProjectSubpage";
import { NoteRow } from "./notes/NoteRow";
import { NotesChatSwitcher } from "./notes/NotesChatSwitcher";
import { NotesComposer, type PendingAttachment } from "./notes/NotesComposer";
import { NotesDaySeparator } from "./notes/NotesDaySeparator";
import { NotesSearchBar } from "./notes/NotesSearchBar";
import { NotesSearchResults } from "./notes/NotesSearchResults";
import { buildDayGroups } from "./notes/notesFormat";
import { buildHighlighter } from "./notes/notesHighlight";

const PAGE_SIZE = 50;
const MAX_ATTACHMENT_BYTES = 100 * 1024 * 1024;

type NotesPages = InfiniteData<notes.Message[], string>;

interface NotesViewProps {
  projectName: string;
  visible: boolean;
  back: PageBack;
}

function chatsKey(projectName: string) {
  return ["notes", projectName, "chats"] as const;
}

function messagesKey(projectName: string, chatID: string) {
  return ["notes", projectName, "messages", chatID] as const;
}

function searchKey(projectName: string, query: string) {
  return ["notes", projectName, "search", query] as const;
}

export function activeChatStorageKey(projectName: string) {
  return `notes:activeChat:${projectName}`;
}

// Single user-wide preference — not per-project. Sidebar collapse is a
// personal layout choice, not a workspace attribute.
const SIDEBAR_COLLAPSED_KEY = "notes:sidebarCollapsed";

export function NotesView({ projectName, visible, back }: NotesViewProps) {
  const qc = useQueryClient();
  const [pending, setPending] = useState<PendingAttachment[]>([]);
  const [activeChatID, setActiveChatID] = useState<string | null>(null);
  // null = user hasn't explicitly chosen yet, so fall back to the
  // chat-count heuristic (collapsed when there's fewer than 2 chats).
  const [sidebarPref, setSidebarPref] = useState<boolean | null>(() => {
    const stored = window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
    return stored === null ? null : stored === "1";
  });
  const setSidebarCollapsed = useCallback((v: boolean) => {
    setSidebarPref(v);
    window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, v ? "1" : "0");
  }, []);

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchText, setSearchText] = useState("");
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const debouncedSearch = useDebounced(searchText, 180);
  const trimmedSearch = debouncedSearch.trim();
  const searchTokens = useMemo(
    () => (trimmedSearch ? trimmedSearch.split(/\s+/).filter(Boolean) : []),
    [trimmedSearch],
  );
  // Compile once per token set — otherwise highlightTokens would build a
  // fresh regex per hit on every render of the results list.
  const highlighter = useMemo(() => buildHighlighter(searchTokens), [searchTokens]);
  // "Search mode" — swaps the message list for the results panel — is active
  // only when the bar is open AND the user has typed something. Opening the
  // bar with an empty field keeps the messages visible.
  const searchOn = searchOpen && searchText.trim().length > 0;

  const openSearch = useCallback(() => setSearchOpen(true), []);
  const closeSearch = useCallback(() => {
    setSearchOpen(false);
    setSearchText("");
  }, []);

  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus();
  }, [searchOpen]);

  const [highlightID, setHighlightID] = useState<string | null>(null);
  const pendingJumpRef = useRef<{ chatID: string; messageID: string } | null>(null);

  const listRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  // While true, any layout/resize of the list pins scroll to bottom — covers
  // async image decodes growing content after the initial scroll. Cleared
  // when the user scrolls away from the bottom.
  const pinToBottomRef = useRef(false);
  // Latch the auto-seed so StrictMode's effect double-invoke (and the window
  // before the mutation registers as pending) can't create two "General" chats.
  const seededChatForProject = useRef<string | null>(null);

  const chatsQuery = useQuery({
    queryKey: chatsKey(projectName),
    queryFn: async () => (await NotesListChats(projectName)) ?? [],
    enabled: visible,
    staleTime: 60_000,
  });
  const chats = useMemo<notes.Chat[]>(
    () => chatsQuery.data ?? [],
    [chatsQuery.data],
  );

  // NotesView isn't remounted across projects (no key prop), so re-seed from
  // storage on every project change rather than in a useState initializer.
  useEffect(() => {
    setActiveChatID(
      window.localStorage.getItem(activeChatStorageKey(projectName)),
    );
    seededChatForProject.current = null;
  }, [projectName]);

  // Fall back to the most-recent chat if the stored one no longer exists
  // (deleted elsewhere, or first ever load for this project).
  useEffect(() => {
    if (chats.length === 0) return;
    const stillExists =
      activeChatID && chats.some((c) => c.id === activeChatID);
    if (!stillExists) setActiveChatID(chats[0].id);
  }, [chats, activeChatID]);

  useEffect(() => {
    if (activeChatID) {
      window.localStorage.setItem(
        activeChatStorageKey(projectName),
        activeChatID,
      );
    }
  }, [activeChatID, projectName]);

  const query = useInfiniteQuery({
    queryKey: messagesKey(projectName, activeChatID ?? ""),
    queryFn: async ({ pageParam }) => {
      if (!activeChatID) return [];
      return (
        (await NotesListMessages(
          projectName,
          activeChatID,
          PAGE_SIZE,
          pageParam,
        )) ?? []
      );
    },
    initialPageParam: "",
    getNextPageParam: (last) =>
      last.length === PAGE_SIZE ? last[last.length - 1].id : undefined,
    enabled: visible && !!activeChatID,
  });

  // The API returns newest-first; flatten pages so the whole buffer stays
  // newest-first. Rendering handles the oldest-first pass.
  const messages = useMemo<notes.Message[]>(
    () => query.data?.pages.flat() ?? [],
    [query.data],
  );
  const groups = useMemo(() => buildDayGroups(messages), [messages]);

  const searchQuery = useQuery({
    queryKey: searchKey(projectName, trimmedSearch),
    queryFn: async () => (await NotesSearch(projectName, trimmedSearch, 50)) ?? [],
    // Gate on the debounced value so a mid-typing render doesn't fire an
    // empty-query request before the user has settled.
    enabled: visible && trimmedSearch.length > 0,
    staleTime: 30_000,
  });
  const hits = useMemo<notes.SearchHit[]>(
    () => searchQuery.data ?? [],
    [searchQuery.data],
  );

  // Fresh landing on a chat should scroll to bottom regardless of whether
  // data is cached with 1 or N pages. User scrolling up clears the pin via
  // handleScroll; sending a new message re-pins via addMutation.onSuccess.
  useEffect(() => {
    pinToBottomRef.current = true;
  }, [activeChatID]);

  useEffect(() => {
    const el = listRef.current;
    if (el && pinToBottomRef.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  // Separately observe the current children so late image decodes (which
  // grow scrollHeight after layout) re-pin. Rebuilds only on chat switch —
  // new messages are handled by the effect above.
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const scrollDown = () => {
      if (pinToBottomRef.current) el.scrollTop = el.scrollHeight;
    };
    const observer = new ResizeObserver(scrollDown);
    for (const child of Array.from(el.children)) observer.observe(child);
    return () => observer.disconnect();
  }, [activeChatID]);

  useEffect(() => {
    if (visible) textareaRef.current?.focus();
  }, [visible]);


  const { hasNextPage, isFetchingNextPage, fetchNextPage, isFetching } = query;
  const handleScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      const el = e.currentTarget;
      const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 16;
      if (!nearBottom) pinToBottomRef.current = false;
      if (el.scrollTop < 80 && hasNextPage && !isFetchingNextPage) {
        fetchNextPage();
      }
    },
    [hasNextPage, isFetchingNextPage, fetchNextPage],
  );

  const jumpToMessage = useCallback((hit: notes.SearchHit) => {
    pendingJumpRef.current = { chatID: hit.chatId, messageID: hit.id };
    setHighlightID(hit.id);
    setSearchOpen(false);
    setSearchText("");
    setActiveChatID(hit.chatId);
  }, []);

  // Gated on !searchOn so the list is mounted when we try to scroll the
  // target into view — the results panel hides the list via `hidden`.
  useEffect(() => {
    const jump = pendingJumpRef.current;
    if (!jump) return;
    if (searchOn) return;
    if (activeChatID !== jump.chatID) return;
    if (isFetching) return;
    const found = messages.some((m) => m.id === jump.messageID);
    if (found) {
      pendingJumpRef.current = null;
      pinToBottomRef.current = false;
      requestAnimationFrame(() => {
        const el = listRef.current?.querySelector<HTMLElement>(
          `[data-msg-id="${jump.messageID}"]`,
        );
        el?.scrollIntoView({ block: "center", behavior: "smooth" });
      });
      const h = window.setTimeout(() => setHighlightID(null), 1800);
      return () => window.clearTimeout(h);
    }
    if (hasNextPage) {
      fetchNextPage();
      return;
    }
    pendingJumpRef.current = null;
    setHighlightID((prev) => (prev === null ? prev : null));
  }, [searchOn, activeChatID, messages, isFetching, hasNextPage, fetchNextPage]);

  const buildPendingFromFile = async (
    file: File,
  ): Promise<PendingAttachment | null> => {
    if (file.size > MAX_ATTACHMENT_BYTES) {
      toast.error(`${file.name} exceeds 100MB limit`);
      return null;
    }
    const buf = await file.arrayBuffer();
    return {
      id: crypto.randomUUID(),
      name: file.name,
      mimeType: file.type || "application/octet-stream",
      size: file.size,
      data: new Uint8Array(buf),
    };
  };

  const buildPendingFromPath = async (
    path: string,
  ): Promise<PendingAttachment | null> => {
    try {
      const input = await NotesReadFileAsInput(path);
      const data = base64ToBytes(input.data);
      return {
        id: crypto.randomUUID(),
        name: input.name,
        mimeType: input.mimeType || "application/octet-stream",
        size: data.byteLength,
        data,
      };
    } catch (err) {
      toast.error(`Attach: ${err}`);
      return null;
    }
  };

  const appendPending = useCallback((items: (PendingAttachment | null)[]) => {
    const valid = items.filter((i): i is PendingAttachment => i !== null);
    if (valid.length > 0) setPending((prev) => [...prev, ...valid]);
  }, []);

  const addFiles = useCallback(
    async (files: FileList | File[]) => {
      const items = await Promise.all(
        Array.from(files).map(buildPendingFromFile),
      );
      appendPending(items);
    },
    [appendPending],
  );

  const addPaths = useCallback(
    async (paths: string[]) => {
      const items = await Promise.all(paths.map(buildPendingFromPath));
      appendPending(items);
    },
    [appendPending],
  );

  useEffect(() => {
    if (!visible) return;
    return registerFileDropHandler(`notes:${projectName}`, (x, y, paths) => {
      const el = document.elementFromPoint(x, y);
      if (!el?.closest(`[data-notes-drop="${projectName}"]`)) return false;
      // No chat selected → nothing to attach to. Consume the drop so it
      // doesn't cascade to another handler with the wrong target.
      if (!activeChatID) return true;
      addPaths(paths);
      return true;
    });
  }, [visible, projectName, addPaths, activeChatID]);

  // Pending attachments belong to the chat the user was composing for. If
  // they switch chats, drop the pending so they can't be sent to the wrong
  // place.
  useEffect(() => {
    setPending([]);
  }, [activeChatID]);

  const removePending = useCallback((id: string) => {
    setPending((prev) => prev.filter((p) => p.id !== id));
  }, []);


  const addMutation = useMutation({
    mutationFn: async (input: {
      chatID: string;
      text: string;
      pending: PendingAttachment[];
    }) => {
      const attachments = input.pending.map<main.NotesAttachmentInput>((p) =>
        main.NotesAttachmentInput.createFrom({
          name: p.name,
          mimeType: p.mimeType,
          data: bytesToBase64(p.data),
        }),
      );
      return NotesAddMessage(
        projectName,
        input.chatID,
        input.text,
        attachments,
      );
    },
    onSuccess: (msg) => {
      qc.setQueryData<NotesPages>(
        messagesKey(projectName, msg.chatId),
        (prev) => {
          if (!prev) return prev;
          const [first, ...rest] = prev.pages;
          return { ...prev, pages: [[msg, ...(first ?? [])], ...rest] };
        },
      );
      qc.setQueryData<notes.Chat[]>(chatsKey(projectName), (prev) => {
        if (!prev) return prev;
        const idx = prev.findIndex((c) => c.id === msg.chatId);
        if (idx < 0) return prev;
        const updated = notes.Chat.createFrom({
          ...prev[idx],
          updatedAt: msg.ts,
        });
        return [updated, ...prev.slice(0, idx), ...prev.slice(idx + 1)];
      });
      pinToBottomRef.current = true;
    },
    onError: (err) => toast.error(`Send: ${err}`),
  });

  const editMutation = useMutation({
    // chatID rides the input so onSuccess doesn't depend on a closure that
    // may have rotated (user switched chats before the response landed).
    mutationFn: async (input: { id: string; chatID: string; text: string }) => {
      await NotesEditMessage(projectName, input.id, input.text);
      return input;
    },
    onSuccess: ({ id, chatID, text }) => {
      const ts = Date.now();
      qc.setQueryData<NotesPages>(messagesKey(projectName, chatID), (prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          pages: prev.pages.map((page) =>
            page.map((m) =>
              m.id === id
                ? notes.Message.createFrom({ ...m, text, editedAt: ts })
                : m,
            ),
          ),
        };
      });
      // Mirror the store's chat recency bump so the sidebar re-sorts.
      qc.setQueryData<notes.Chat[]>(chatsKey(projectName), (prev) => {
        if (!prev) return prev;
        const idx = prev.findIndex((c) => c.id === chatID);
        if (idx < 0) return prev;
        const updated = notes.Chat.createFrom({ ...prev[idx], updatedAt: ts });
        return [updated, ...prev.slice(0, idx), ...prev.slice(idx + 1)];
      });
    },
    onError: (err) => toast.error(`Edit: ${err}`),
  });

  const deleteMutation = useMutation({
    mutationFn: async (input: { id: string; chatID: string }) => {
      await NotesDeleteMessage(projectName, input.id);
      return input;
    },
    onSuccess: ({ id, chatID }) => {
      qc.setQueryData<NotesPages>(messagesKey(projectName, chatID), (prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          pages: prev.pages.map((page) => page.filter((m) => m.id !== id)),
        };
      });
    },
    onError: (err) => toast.error(`Delete: ${err}`),
  });

  const createChatMutation = useMutation({
    mutationFn: async (title: string) => NotesCreateChat(projectName, title),
    onSuccess: (chat) => {
      qc.setQueryData<notes.Chat[]>(chatsKey(projectName), (prev) => [
        chat,
        ...(prev ?? []),
      ]);
      setActiveChatID(chat.id);
    },
    onError: (err) => toast.error(`New chat: ${err}`),
  });

  // Seed a "General" chat the first time a project's notes are opened.
  // Gated on success (not just settled) so a failed chats fetch doesn't
  // create a chat against a broken backend.
  useEffect(() => {
    if (!chatsQuery.isSuccess || chats.length > 0) return;
    if (seededChatForProject.current === projectName) return;
    seededChatForProject.current = projectName;
    createChatMutation.mutate("General");
  }, [chatsQuery.isSuccess, chats.length, createChatMutation, projectName]);

  const renameChatMutation = useMutation({
    mutationFn: async (input: { id: string; title: string }) => {
      await NotesRenameChat(projectName, input.id, input.title);
      return input;
    },
    onSuccess: ({ id, title }) => {
      qc.setQueryData<notes.Chat[]>(chatsKey(projectName), (prev) =>
        prev?.map((c) =>
          c.id === id ? notes.Chat.createFrom({ ...c, title }) : c,
        ),
      );
    },
    onError: (err) => toast.error(`Rename: ${err}`),
  });

  const deleteChatMutation = useMutation({
    mutationFn: async (id: string) => {
      await NotesDeleteChat(projectName, id);
      return id;
    },
    onSuccess: (id) => {
      qc.setQueryData<notes.Chat[]>(chatsKey(projectName), (prev) =>
        prev?.filter((c) => c.id !== id),
      );
      qc.removeQueries({ queryKey: messagesKey(projectName, id) });
      if (activeChatID === id) setActiveChatID(null);
    },
    onError: (err) => toast.error(`Delete chat: ${err}`),
  });

  const handleSend = useCallback(
    (text: string, sent: () => void) => {
      if (addMutation.isPending || !activeChatID) return;
      addMutation.mutate(
        { chatID: activeChatID, text, pending },
        {
          onSuccess: () => {
            sent();
            setPending([]);
          },
        },
      );
    },
    [addMutation, pending, activeChatID],
  );

  // Stable message-row callbacks so NoteRow's memo holds when NotesView
  // re-renders. chatID comes from the message, not the active selection, so
  // edits/deletes land in the correct chat even if the user switches mid-flight.
  const handleSaveMessage = useCallback(
    (id: string, chatID: string, text: string) =>
      editMutation.mutate({ id, chatID, text }),
    [editMutation],
  );
  const handleDeleteMessage = useCallback(
    (id: string, chatID: string) => deleteMutation.mutate({ id, chatID }),
    [deleteMutation],
  );

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    if (!activeChatID) return;
    const items = e.clipboardData?.items;
    if (!items) return;
    const files: File[] = [];
    for (const item of Array.from(items)) {
      if (item.kind === "file") {
        const f = item.getAsFile();
        if (f) files.push(f);
      }
    }
    if (files.length > 0) {
      e.preventDefault();
      addFiles(files);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!activeChatID) return;
    if (e.dataTransfer?.files?.length) addFiles(e.dataTransfer.files);
  };

  const isEmpty =
    !query.isPending && activeChatID !== null && messages.length === 0;
  const activeChat = activeChatID
    ? chats.find((c) => c.id === activeChatID)
    : null;
  const composerPlaceholder = activeChat ? "Write a note…" : "Pick a chat…";
  // With no explicit pref, default to collapsed when there's nothing to
  // navigate to (fewer than 2 chats).
  const effectiveCollapsed = sidebarPref ?? chats.length < 2;
  const createChat = () => createChatMutation.mutate("New chat");

  const headerActions = effectiveCollapsed && chats.length > 0 && (
    <>
      <button type="button" onClick={openSearch} className={`${BTN_SECONDARY} flex items-center gap-1.5`}>
        <SearchIcon />
        Search
      </button>
      <NotesChatSwitcher
        chats={chats}
        activeId={activeChatID}
        onSelect={setActiveChatID}
        onCreate={createChat}
        onShowList={() => setSidebarCollapsed(false)}
      />
    </>
  );

  const composer = (
    <NotesComposer
      textareaRef={textareaRef}
      fileInputRef={fileInputRef}
      pending={pending}
      onRemovePending={removePending}
      onAddFiles={(files) => void addFiles(files)}
      onPaste={handlePaste}
      onSend={handleSend}
      placeholder={composerPlaceholder}
      disabled={!activeChatID}
      ready={!addMutation.isPending && !!activeChatID}
    />
  );

  return (
    <div
      data-notes-drop={projectName}
      className="flex min-h-0 flex-1 flex-col bg-[var(--bg-primary)]"
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
      }}
      onDrop={handleDrop}
    >
      <ProjectSubpage
        back={back}
        title="Notes"
        icon={MessageSquare}
        description="Commands, credentials and context for this project that don't belong in the repo."
        actions={headerActions}
        scroll={false}
      >
        <div className={`${SUBPAGE_COLUMN} flex min-h-0 flex-1 gap-4`}>
          {!effectiveCollapsed && chats.length > 0 && (
            <ChatList
              chats={chats}
              activeId={activeChatID}
              onSelect={setActiveChatID}
              onCreate={createChat}
              onSearch={openSearch}
              onRename={(id, title) => renameChatMutation.mutate({ id, title })}
              onDelete={(id) => deleteChatMutation.mutate(id)}
              onCollapse={() => setSidebarCollapsed(true)}
              canDelete={chats.length > 1}
            />
          )}

          <div className="relative flex min-w-0 flex-1 flex-col">
            {searchOpen && (
              <NotesSearchBar
                inputRef={searchInputRef}
                value={searchText}
                onChange={setSearchText}
                onClose={closeSearch}
              />
            )}
            {searchOn && (
              <NotesSearchResults
                query={trimmedSearch}
                hits={hits}
                pending={searchQuery.isPending}
                error={searchQuery.isError ? searchQuery.error : null}
                highlighter={highlighter}
                onPick={jumpToMessage}
              />
            )}
            <div
              ref={listRef}
              onScroll={handleScroll}
              className={`-mx-3 flex min-h-0 flex-1 flex-col overflow-y-auto pb-3 pt-3 ${searchOn ? "hidden" : ""}`}
            >
              {isEmpty ? (
                <div className="flex flex-1 items-center justify-center">
                  <EmptyState
                    icon={<MessageSquare size={20} strokeWidth={1.8} />}
                    title="Knowledge you can't commit"
                    body="Credentials, commands, context, screenshots: the stuff you'd otherwise lose in a DM to yourself. End-to-end encrypted, and it never leaves this device."
                  />
                </div>
              ) : (
                <div className="flex flex-col">
                  {query.hasNextPage && (
                    <div className="mb-2 text-center text-[11px] text-[var(--text-muted)]">
                      {query.isFetchingNextPage ? "Loading older notes…" : "Scroll up for older notes"}
                    </div>
                  )}
                  {groups.map(({ key, label, items }) => (
                    <div key={key}>
                      <NotesDaySeparator label={label} />
                      <div className="flex flex-col gap-0.5">
                        {items.map((m) => (
                          <NoteRow
                            key={m.id}
                            message={m}
                            projectName={projectName}
                            highlight={m.id === highlightID}
                            onSave={handleSaveMessage}
                            onDelete={handleDeleteMessage}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="pb-5 pt-2">{composer}</div>
          </div>
        </div>
      </ProjectSubpage>
    </div>
  );
}

function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const h = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(h);
  }, [value, delayMs]);
  return debounced;
}

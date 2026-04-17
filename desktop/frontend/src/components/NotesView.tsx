import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
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
  NotesReadAttachment,
  NotesReadFileAsInput,
  NotesRenameChat,
} from "../../wailsjs/go/main/App";
import { registerFileDropHandler } from "../fileDrop";
import { main, notes } from "../../wailsjs/go/models";
import { PaperclipIcon, SendIcon, TrashIcon, PencilIcon, DownloadIcon, MessageIcon, SidebarIcon } from "./icons";
import { base64ToBytes, bytesToBase64, bytesToBlobUrl, downloadBlob } from "../download";
import { useAutoGrowTextarea } from "../hooks/useAutoGrowTextarea";
import { MessageMarkdown } from "./MessageMarkdown";
import { ChatList } from "./ChatList";

const PAGE_SIZE = 50;
const MAX_ATTACHMENT_BYTES = 100 * 1024 * 1024;
const TEXTAREA_MAX_HEIGHT_PX = 216;

type NotesPages = InfiniteData<notes.Message[], string>;

interface NotesViewProps {
  projectName: string;
  visible: boolean;
}

interface PendingAttachment {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  data: Uint8Array;
}

function chatsKey(projectName: string) {
  return ["notes", projectName, "chats"] as const;
}

function messagesKey(projectName: string, chatID: string) {
  return ["notes", projectName, "messages", chatID] as const;
}

export function activeChatStorageKey(projectName: string) {
  return `notes:activeChat:${projectName}`;
}

// Single user-wide preference — not per-project. Sidebar collapse is a
// personal layout choice, not a workspace attribute.
const SIDEBAR_COLLAPSED_KEY = "notes:sidebarCollapsed";

export function NotesView({ projectName, visible }: NotesViewProps) {
  const qc = useQueryClient();
  const [text, setText] = useState("");
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
  const chats = useMemo<notes.Chat[]>(() => chatsQuery.data ?? [], [chatsQuery.data]);

  // NotesView isn't remounted across projects (no key prop), so re-seed from
  // storage on every project change rather than in a useState initializer.
  useEffect(() => {
    setActiveChatID(window.localStorage.getItem(activeChatStorageKey(projectName)));
    seededChatForProject.current = null;
  }, [projectName]);

  // Fall back to the most-recent chat if the stored one no longer exists
  // (deleted elsewhere, or first ever load for this project).
  useEffect(() => {
    if (chats.length === 0) return;
    const stillExists = activeChatID && chats.some((c) => c.id === activeChatID);
    if (!stillExists) setActiveChatID(chats[0].id);
  }, [chats, activeChatID]);

  useEffect(() => {
    if (activeChatID) {
      window.localStorage.setItem(activeChatStorageKey(projectName), activeChatID);
    }
  }, [activeChatID, projectName]);

  const query = useInfiniteQuery({
    queryKey: messagesKey(projectName, activeChatID ?? ""),
    queryFn: async ({ pageParam }) => {
      if (!activeChatID) return [];
      return (await NotesListMessages(projectName, activeChatID, PAGE_SIZE, pageParam)) ?? [];
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

  // Arm the pin whenever we freshly land on a chat's messages — initial
  // load, chat switch, or tab reactivation.
  useEffect(() => {
    if (query.isSuccess && query.data?.pages.length === 1) {
      pinToBottomRef.current = true;
    }
  }, [query.isSuccess, query.data?.pages.length, activeChatID]);

  // Scroll on every message list change while pinned. Catches initial load,
  // new message appends, and chat switches.
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

  useAutoGrowTextarea(textareaRef, text, TEXTAREA_MAX_HEIGHT_PX);

  const { hasNextPage, isFetchingNextPage, fetchNextPage } = query;
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

  const buildPendingFromFile = async (file: File): Promise<PendingAttachment | null> => {
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

  const buildPendingFromPath = async (path: string): Promise<PendingAttachment | null> => {
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
      const items = await Promise.all(Array.from(files).map(buildPendingFromFile));
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
      addPaths(paths);
      return true;
    });
  }, [visible, projectName, addPaths]);

  const removePending = useCallback((id: string) => {
    setPending((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const canSend = text.trim().length > 0 || pending.length > 0;

  const addMutation = useMutation({
    mutationFn: async (input: { chatID: string; text: string; pending: PendingAttachment[] }) => {
      const attachments = input.pending.map<main.NotesAttachmentInput>((p) =>
        main.NotesAttachmentInput.createFrom({
          name: p.name,
          mimeType: p.mimeType,
          data: bytesToBase64(p.data),
        }),
      );
      return NotesAddMessage(projectName, input.chatID, input.text, attachments);
    },
    onSuccess: (msg) => {
      qc.setQueryData<NotesPages>(messagesKey(projectName, msg.chatId), (prev) => {
        if (!prev) return prev;
        const [first, ...rest] = prev.pages;
        return { ...prev, pages: [[msg, ...(first ?? [])], ...rest] };
      });
      qc.setQueryData<notes.Chat[]>(chatsKey(projectName), (prev) => {
        if (!prev) return prev;
        const idx = prev.findIndex((c) => c.id === msg.chatId);
        if (idx < 0) return prev;
        const updated = notes.Chat.createFrom({ ...prev[idx], updatedAt: msg.ts });
        return [updated, ...prev.slice(0, idx), ...prev.slice(idx + 1)];
      });
      pinToBottomRef.current = true;
    },
    onError: (err) => toast.error(`Send: ${err}`),
  });

  const editMutation = useMutation({
    mutationFn: async (input: { id: string; text: string }) => {
      await NotesEditMessage(projectName, input.id, input.text);
      return input;
    },
    onSuccess: ({ id, text }) => {
      if (!activeChatID) return;
      qc.setQueryData<NotesPages>(messagesKey(projectName, activeChatID), (prev) => {
        if (!prev) return prev;
        const ts = Date.now();
        return {
          ...prev,
          pages: prev.pages.map((page) =>
            page.map((m) =>
              m.id === id ? notes.Message.createFrom({ ...m, text, editedAt: ts }) : m,
            ),
          ),
        };
      });
    },
    onError: (err) => toast.error(`Edit: ${err}`),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await NotesDeleteMessage(projectName, id);
      return id;
    },
    onSuccess: (id) => {
      if (!activeChatID) return;
      qc.setQueryData<NotesPages>(messagesKey(projectName, activeChatID), (prev) => {
        if (!prev) return prev;
        return { ...prev, pages: prev.pages.map((page) => page.filter((m) => m.id !== id)) };
      });
    },
    onError: (err) => toast.error(`Delete: ${err}`),
  });

  const createChatMutation = useMutation({
    mutationFn: async (title: string) => NotesCreateChat(projectName, title),
    onSuccess: (chat) => {
      qc.setQueryData<notes.Chat[]>(chatsKey(projectName), (prev) => [chat, ...(prev ?? [])]);
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
        prev?.map((c) => (c.id === id ? notes.Chat.createFrom({ ...c, title }) : c)),
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

  const handleSend = useCallback(() => {
    if (!canSend || addMutation.isPending || !activeChatID) return;
    addMutation.mutate(
      { chatID: activeChatID, text, pending },
      {
        onSuccess: () => {
          setText("");
          setPending([]);
        },
      },
    );
  }, [addMutation, canSend, pending, text, activeChatID]);

  // Stable message-row callbacks so MessageRow's memo actually holds across
  // composer keystrokes (which re-render NotesView on every character).
  const handleSaveMessage = useCallback(
    (id: string, text: string) => editMutation.mutate({ id, text }),
    [editMutation],
  );
  const handleDeleteMessage = useCallback(
    (id: string) => deleteMutation.mutate(id),
    [deleteMutation],
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
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
    if (e.dataTransfer?.files?.length) addFiles(e.dataTransfer.files);
  };

  const isEmpty = !query.isPending && activeChatID !== null && messages.length === 0;
  const activeChat = activeChatID ? chats.find((c) => c.id === activeChatID) : null;
  const composerPlaceholder = activeChat ? `Message ${activeChat.title}…` : "Pick a chat…";
  // With no explicit pref, default to collapsed when there's nothing to
  // navigate to (fewer than 2 chats).
  const effectiveCollapsed = sidebarPref ?? chats.length < 2;

  return (
    <div
      data-notes-drop={projectName}
      className="flex h-full min-h-0 flex-1 bg-[var(--bg-primary)]"
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
      }}
      onDrop={handleDrop}
    >
      {!effectiveCollapsed && chats.length > 0 && (
        <ChatList
          chats={chats}
          activeId={activeChatID}
          onSelect={setActiveChatID}
          onCreate={() => createChatMutation.mutate("New chat")}
          onRename={(id, title) => renameChatMutation.mutate({ id, title })}
          onDelete={(id) => deleteChatMutation.mutate(id)}
          onCollapse={() => setSidebarCollapsed(true)}
          canDelete={chats.length > 1}
        />
      )}

      <div className="relative flex min-w-0 flex-1 flex-col">
        {effectiveCollapsed && chats.length > 0 && (
          <button
            onClick={() => setSidebarCollapsed(false)}
            className="absolute left-3 top-3 z-10 flex h-7 w-7 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--bg-primary)] text-[var(--text-muted)] shadow-sm transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
            title="Show chats"
            aria-label="Show chats"
          >
            <SidebarIcon />
          </button>
        )}
        <div
          ref={listRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto px-6 py-5"
        >
          {query.hasNextPage && (
            <div className="mb-3 text-center text-[11px] text-[var(--text-muted)]">
              {query.isFetchingNextPage ? "Loading older…" : "Scroll up for older"}
            </div>
          )}
          {isEmpty && (
            <div className="flex h-full flex-col items-center justify-center gap-5 text-center">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--bg-secondary)] text-[var(--text-muted)]">
                <MessageIcon />
              </div>
              <div className="flex flex-col gap-1">
                <p className="text-sm font-medium text-[var(--text-primary)]">
                  {activeChat ? activeChat.title : "Start a note"}
                </p>
                <p className="text-xs text-[var(--text-muted)]">
                  Write, paste, or drop files — end-to-end encrypted.
                </p>
              </div>
            </div>
          )}
          {groups.map(({ key, label, items }) => (
            <div key={key}>
              <DaySeparator label={label} />
              <div className="space-y-0.5">
                {items.map((m) => (
                  <MessageRow
                    key={m.id}
                    message={m}
                    projectName={projectName}
                    onSave={handleSaveMessage}
                    onDelete={handleDeleteMessage}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="mx-4 mt-2 mb-4 rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] transition-colors focus-within:border-[var(--text-primary)]/30">
          {pending.length > 0 && (
            <div className="flex flex-wrap gap-1.5 border-b border-[var(--border)] px-3 py-2">
              {pending.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center gap-1.5 rounded-md bg-[var(--bg-hover)] px-2 py-1 text-[11px] text-[var(--text-secondary)]"
                >
                  <PaperclipIcon />
                  <span className="max-w-[160px] truncate">{p.name}</span>
                  <span className="text-[var(--text-muted)]">{formatSize(p.size)}</span>
                  <button
                    onClick={() => removePending(p.id)}
                    className="ml-0.5 text-[var(--text-muted)] opacity-60 hover:opacity-100"
                    aria-label={`Remove ${p.name}`}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={composerPlaceholder}
            rows={1}
            disabled={!activeChatID}
            className="w-full resize-none bg-transparent px-3 pt-2.5 pb-1 text-sm outline-none placeholder:text-[var(--text-muted)] disabled:opacity-60"
            style={{ minHeight: 40, maxHeight: TEXTAREA_MAX_HEIGHT_PX }}
          />
          <div className="flex items-center justify-between px-2 pb-1.5 pt-0.5">
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={!activeChatID}
              className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)] disabled:opacity-40"
              title="Attach files"
              aria-label="Attach files"
            >
              <PaperclipIcon />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files) addFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <div className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="hidden text-[10px] text-[var(--text-muted)] sm:inline"
              >
                <kbd className="font-mono">↵</kbd> send · <kbd className="font-mono">⇧↵</kbd> newline · markdown
              </span>
              <button
                onClick={handleSend}
                disabled={!canSend || addMutation.isPending || !activeChatID}
                className="flex h-7 w-7 items-center justify-center rounded-md bg-[var(--text-primary)] text-[var(--bg-primary)] transition-opacity disabled:bg-[var(--bg-hover)] disabled:text-[var(--text-muted)]"
                title="Send (Enter)"
                aria-label="Send message"
              >
                <SendIcon />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function DaySeparator({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 py-2">
      <span className="h-px flex-1 bg-[var(--border)]" />
      <span className="text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
        {label}
      </span>
      <span className="h-px flex-1 bg-[var(--border)]" />
    </div>
  );
}

interface DayGroup {
  key: string;
  label: string;
  items: notes.Message[];
}

// Single pass: walk newest-first input from the tail to produce oldest-first
// groups, and format each day label exactly once (≈30 times for 500 messages
// instead of 500).
function buildDayGroups(newestFirst: notes.Message[]): DayGroup[] {
  const groups: DayGroup[] = [];
  const now = new Date();
  for (let i = newestFirst.length - 1; i >= 0; i--) {
    const m = newestFirst[i];
    const d = new Date(m.ts);
    const key = d.toDateString();
    const last = groups[groups.length - 1];
    if (last && last.key === key) {
      last.items.push(m);
    } else {
      groups.push({ key, label: formatDayLabel(d, now), items: [m] });
    }
  }
  return groups;
}

interface MessageRowProps {
  message: notes.Message;
  projectName: string;
  onSave: (id: string, text: string) => void;
  onDelete: (id: string) => void;
}

const MessageRow = memo(function MessageRow({ message, projectName, onSave, onDelete }: MessageRowProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const editing = draft !== null;
  const editRef = useRef<HTMLTextAreaElement | null>(null);
  useAutoGrowTextarea(editRef, draft ?? "", TEXTAREA_MAX_HEIGHT_PX);

  const cancel = () => setDraft(null);
  const save = () => {
    if (draft === null) return;
    const trimmed = draft;
    if (trimmed !== message.text) onSave(message.id, trimmed);
    setDraft(null);
  };
  const handleDelete = () => onDelete(message.id);

  return (
    <div className="group relative -mx-2 rounded-md px-2 py-1 hover:bg-[var(--bg-hover)]/50">
      {!editing && (
        <div className="pointer-events-none absolute right-2 top-0 z-10 flex items-center gap-0.5 rounded-md border border-[var(--border)] bg-[var(--bg-primary)] p-0.5 opacity-0 shadow-sm transition-opacity group-hover:pointer-events-auto group-hover:opacity-100">
          <button
            onClick={() => setDraft(message.text)}
            className="flex h-6 w-6 items-center justify-center rounded text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
            title="Edit"
            aria-label="Edit"
          >
            <PencilIcon />
          </button>
          <button
            onClick={handleDelete}
            className="flex h-6 w-6 items-center justify-center rounded text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--accent-red)]"
            title="Delete"
            aria-label="Delete"
          >
            <TrashIcon />
          </button>
        </div>
      )}
      {editing ? (
        <div className="flex flex-col gap-2 py-1">
          <textarea
            ref={editRef}
            autoFocus
            value={draft ?? ""}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) save();
              if (e.key === "Escape") cancel();
            }}
            className="w-full resize-none rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-sm outline-none focus:border-[var(--text-primary)]/30"
            rows={1}
            style={{ maxHeight: TEXTAREA_MAX_HEIGHT_PX }}
          />
          <div className="flex items-center gap-2">
            <button
              onClick={save}
              className="rounded-md bg-[var(--text-primary)] px-3 py-1 text-[11px] text-[var(--bg-primary)]"
            >
              Save
            </button>
            <button
              onClick={cancel}
              className="rounded-md px-3 py-1 text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            >
              Cancel
            </button>
            <span className="ml-auto text-[10px] text-[var(--text-muted)]">
              ⌘↵ save · esc cancel
            </span>
          </div>
        </div>
      ) : (
        <>
          <MessageMarkdown text={message.text} />
          <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-[var(--text-muted)]">
            <span>{formatTime(message.ts)}</span>
            {message.editedAt && <span>· edited</span>}
          </div>
        </>
      )}
      {message.attachments && message.attachments.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {message.attachments.map((att) => (
            <AttachmentChip key={att.hash} projectName={projectName} attachment={att} />
          ))}
        </div>
      )}
    </div>
  );
});

interface AttachmentChipProps {
  projectName: string;
  attachment: notes.Attachment;
}

function AttachmentChip({ projectName, attachment }: AttachmentChipProps) {
  const [url, setUrl] = useState<string | null>(null);
  const isImage = attachment.mimeType?.startsWith("image/");

  // Ref-tracked so StrictMode's double-invocation doesn't revoke the live URL
  // before <img> finishes loading.
  const urlRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isImage) return;
    let cancelled = false;
    (async () => {
      try {
        const b64 = await NotesReadAttachment(projectName, attachment.hash);
        if (cancelled) return;
        const u = bytesToBlobUrl(
          base64ToBytes(b64),
          attachment.mimeType || "application/octet-stream",
        );
        if (urlRef.current) URL.revokeObjectURL(urlRef.current);
        urlRef.current = u;
        setUrl(u);
      } catch (err) {
        console.warn("attachment preview failed", attachment.hash, err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectName, attachment.hash, attachment.mimeType, isImage]);

  useEffect(
    () => () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    },
    [],
  );

  const download = async () => {
    try {
      const b64 = await NotesReadAttachment(projectName, attachment.hash);
      downloadBlob(
        base64ToBytes(b64),
        attachment.name,
        attachment.mimeType || "application/octet-stream",
      );
    } catch (err) {
      toast.error(`Download: ${err}`);
    }
  };

  if (isImage && url) {
    return (
      <button
        onClick={download}
        className="overflow-hidden rounded-lg border border-[var(--border)] transition-opacity hover:opacity-90"
        title={`${attachment.name} · ${formatSize(attachment.size)} — click to download`}
      >
        <img src={url} alt={attachment.name} className="max-h-56 max-w-xs object-contain" />
      </button>
    );
  }

  return (
    <button
      onClick={download}
      className="flex items-center gap-2 rounded-md bg-[var(--bg-hover)] px-2.5 py-1.5 text-[11px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)]/70 hover:text-[var(--text-primary)]"
      title={`Download ${attachment.name}`}
    >
      <DownloadIcon />
      <span className="max-w-[220px] truncate">{attachment.name}</span>
      <span className="text-[var(--text-muted)]">{formatSize(attachment.size)}</span>
    </button>
  );
}

function formatSize(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDayLabel(d: Date, now: Date) {
  const startOfDay = (x: Date) =>
    new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOfDay(now) - startOfDay(d)) / 86_400_000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return d.toLocaleDateString([], { weekday: "long" });
  if (d.getFullYear() === now.getFullYear()) {
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
  }
  return d.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

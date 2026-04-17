import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  NotesAddMessage,
  NotesDeleteMessage,
  NotesEditMessage,
  NotesListMessages,
  NotesReadAttachment,
} from "../../wailsjs/go/main/App";
import { main, notes } from "../../wailsjs/go/models";
import { PaperclipIcon, SendIcon, TrashIcon, PencilIcon, DownloadIcon } from "./icons";
import { base64ToBytes, bytesToBase64, bytesToBlobUrl, downloadBlob } from "../download";
import { useAutoGrowTextarea } from "../hooks/useAutoGrowTextarea";

const PAGE_SIZE = 50;
const MAX_ATTACHMENT_BYTES = 100 * 1024 * 1024;
// ~10 lines of text-sm (14px, leading-5) + py-2 (16px padding).
const TEXTAREA_MAX_HEIGHT_PX = 216;

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

export function NotesView({ projectName, visible }: NotesViewProps) {
  const [messages, setMessages] = useState<notes.Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [text, setText] = useState("");
  const [pending, setPending] = useState<PendingAttachment[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");

  const listRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const loadLatest = useCallback(async () => {
    setLoading(true);
    try {
      const page = (await NotesListMessages(projectName, PAGE_SIZE, "")) ?? [];
      setMessages(page);
      setHasMore(page.length === PAGE_SIZE);
      requestAnimationFrame(() => {
        if (listRef.current) {
          listRef.current.scrollTop = listRef.current.scrollHeight;
        }
      });
    } catch (err) {
      toast.error(`Load notes: ${err}`);
    } finally {
      setLoading(false);
    }
  }, [projectName]);

  useEffect(() => {
    if (!visible) return;
    loadLatest();
  }, [visible, loadLatest]);

  useEffect(() => {
    if (visible && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [visible]);

  useAutoGrowTextarea(textareaRef, text, TEXTAREA_MAX_HEIGHT_PX);

  // `messages` is stored newest-first (matching the API), so the pagination
  // cursor for "older" messages is the ID of the LAST element in the array.
  const loadOlder = useCallback(async () => {
    if (!messages.length || !hasMore || loading) return;
    const cursor = messages[messages.length - 1].id;
    setLoading(true);
    try {
      const page = (await NotesListMessages(projectName, PAGE_SIZE, cursor)) ?? [];
      setMessages((prev) => [...prev, ...page]);
      setHasMore(page.length === PAGE_SIZE);
    } catch (err) {
      toast.error(`Load older: ${err}`);
    } finally {
      setLoading(false);
    }
  }, [messages, hasMore, loading, projectName]);

  const handleScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      if (e.currentTarget.scrollTop < 80) loadOlder();
    },
    [loadOlder],
  );

  const addFiles = useCallback(async (files: FileList | File[]) => {
    const list = Array.from(files);
    for (const file of list) {
      if (file.size > MAX_ATTACHMENT_BYTES) {
        toast.error(`${file.name} exceeds 100MB limit`);
        continue;
      }
      const buf = await file.arrayBuffer();
      setPending((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          name: file.name,
          mimeType: file.type || "application/octet-stream",
          size: file.size,
          data: new Uint8Array(buf),
        },
      ]);
    }
  }, []);

  const removePending = useCallback((id: string) => {
    setPending((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const canSend = text.trim().length > 0 || pending.length > 0;

  const handleSend = useCallback(async () => {
    if (!canSend) return;
    const attachments = pending.map<main.NotesAttachmentInput>((p) =>
      main.NotesAttachmentInput.createFrom({
        name: p.name,
        mimeType: p.mimeType,
        data: bytesToBase64(p.data),
      }),
    );
    try {
      const msg = await NotesAddMessage(projectName, text, attachments);
      setMessages((prev) => [msg, ...prev]);
      setText("");
      setPending([]);
      requestAnimationFrame(() => {
        if (listRef.current) {
          listRef.current.scrollTop = listRef.current.scrollHeight;
        }
      });
    } catch (err) {
      toast.error(`Send: ${err}`);
    }
  }, [canSend, pending, projectName, text]);

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
    if (e.dataTransfer?.files?.length) {
      addFiles(e.dataTransfer.files);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await NotesDeleteMessage(projectName, id);
      setMessages((prev) => prev.filter((m) => m.id !== id));
    } catch (err) {
      toast.error(`Delete: ${err}`);
    }
  };

  const startEdit = (m: notes.Message) => {
    setEditingId(m.id);
    setEditingText(m.text);
  };

  const saveEdit = async () => {
    if (!editingId) return;
    try {
      await NotesEditMessage(projectName, editingId, editingText);
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== editingId) return m;
          return notes.Message.createFrom({
            ...m,
            text: editingText,
            editedAt: Date.now(),
          });
        }),
      );
      setEditingId(null);
      setEditingText("");
    } catch (err) {
      toast.error(`Edit: ${err}`);
    }
  };

  const ordered = useMemo(() => [...messages].reverse(), [messages]);

  return (
    <div
      className="flex h-full min-h-0 flex-1 flex-col"
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
      }}
      onDrop={handleDrop}
    >
      <div
        ref={listRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-6 py-4 space-y-3"
      >
        {hasMore && messages.length >= PAGE_SIZE && (
          <div className="text-center text-xs text-[var(--text-muted)]">
            {loading ? "Loading older…" : "Scroll up for older messages"}
          </div>
        )}
        {ordered.length === 0 && !loading && (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <p className="text-sm font-medium text-[var(--text-primary)]">No notes yet</p>
            <p className="text-xs text-[var(--text-muted)]">
              Start a thread for {projectName} — messages and files are encrypted on disk.
            </p>
          </div>
        )}
        {ordered.map((m) => (
          <MessageBubble
            key={m.id}
            message={m}
            projectName={projectName}
            editing={editingId === m.id}
            editingText={editingText}
            onEditingTextChange={setEditingText}
            onStartEdit={() => startEdit(m)}
            onCancelEdit={() => {
              setEditingId(null);
              setEditingText("");
            }}
            onSaveEdit={saveEdit}
            onDelete={() => handleDelete(m.id)}
          />
        ))}
      </div>

      <div className="border-t border-[var(--border)] bg-[var(--bg-primary)] px-4 py-3">
        {pending.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {pending.map((p) => (
              <div
                key={p.id}
                className="flex items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--bg-hover)] px-2 py-1 text-xs"
              >
                <PaperclipIcon />
                <span className="max-w-[180px] truncate">{p.name}</span>
                <span className="text-[var(--text-muted)]">{formatSize(p.size)}</span>
                <button
                  onClick={() => removePending(p.id)}
                  className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                  aria-label={`Remove ${p.name}`}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="flex items-end gap-2">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
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
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={`Message #${projectName}…`}
            rows={1}
            className="flex-1 resize-none rounded-md border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-sm outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--text-primary)]/40"
            style={{ minHeight: 36, maxHeight: TEXTAREA_MAX_HEIGHT_PX }}
          />
          <button
            onClick={handleSend}
            disabled={!canSend}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[var(--text-primary)] text-[var(--bg-primary)] disabled:opacity-40"
            title="Send (Enter)"
            aria-label="Send message"
          >
            <SendIcon />
          </button>
        </div>
        <p className="mt-1 text-[10px] text-[var(--text-muted)]">
          Enter to send · Shift+Enter for newline · drag-drop or paste to attach files
        </p>
      </div>
    </div>
  );
}

interface MessageBubbleProps {
  message: notes.Message;
  projectName: string;
  editing: boolean;
  editingText: string;
  onEditingTextChange: (v: string) => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  onDelete: () => void;
}

function MessageBubble({
  message,
  projectName,
  editing,
  editingText,
  onEditingTextChange,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onDelete,
}: MessageBubbleProps) {
  const editRef = useRef<HTMLTextAreaElement | null>(null);
  // Sized to fit existing text when edit mode opens, then grows while typing.
  useAutoGrowTextarea(editRef, editing ? editingText : "", TEXTAREA_MAX_HEIGHT_PX);

  return (
    <div className="group flex flex-col rounded-md px-3 py-2 hover:bg-[var(--bg-hover)]">
      <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
        <span>{formatTime(message.ts)}</span>
        {message.editedAt && <span className="italic">edited</span>}
        <div className="ml-auto flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            onClick={onStartEdit}
            className="rounded p-1 hover:bg-[var(--bg-primary)] hover:text-[var(--text-primary)]"
            title="Edit message"
            aria-label="Edit message"
          >
            <PencilIcon />
          </button>
          <button
            onClick={onDelete}
            className="rounded p-1 hover:bg-[var(--bg-primary)] hover:text-red-400"
            title="Delete message"
            aria-label="Delete message"
          >
            <TrashIcon />
          </button>
        </div>
      </div>
      {editing ? (
        <div className="mt-1 flex flex-col gap-2">
          <textarea
            ref={editRef}
            autoFocus
            value={editingText}
            onChange={(e) => onEditingTextChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) onSaveEdit();
              if (e.key === "Escape") onCancelEdit();
            }}
            className="w-full resize-none rounded-md border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-sm outline-none focus:border-[var(--text-primary)]/40"
            rows={1}
            style={{ maxHeight: TEXTAREA_MAX_HEIGHT_PX }}
          />
          <div className="flex gap-2">
            <button
              onClick={onSaveEdit}
              className="rounded-md bg-[var(--text-primary)] px-3 py-1 text-xs text-[var(--bg-primary)]"
            >
              Save
            </button>
            <button
              onClick={onCancelEdit}
              className="rounded-md border border-[var(--border)] px-3 py-1 text-xs text-[var(--text-secondary)]"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="whitespace-pre-wrap text-sm text-[var(--text-primary)]">
          {message.text}
        </div>
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
}

interface AttachmentChipProps {
  projectName: string;
  attachment: notes.Attachment;
}

function AttachmentChip({ projectName, attachment }: AttachmentChipProps) {
  const [url, setUrl] = useState<string | null>(null);
  const isImage = attachment.mimeType?.startsWith("image/");

  // Track the live URL in a ref so we revoke it only when it's truly replaced
  // or on unmount — not on every effect cleanup. StrictMode's dev-only double
  // invocation would otherwise revoke the URL before <img> finishes loading.
  const urlRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, []);

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
        className="group/att overflow-hidden rounded-md border border-[var(--border)]"
        title={`${attachment.name} · ${formatSize(attachment.size)} (click to download)`}
      >
        <img src={url} alt={attachment.name} className="max-h-48 max-w-xs object-contain" />
      </button>
    );
  }

  return (
    <button
      onClick={download}
      className="flex items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--bg-primary)] px-2 py-1 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
      title={`Download ${attachment.name}`}
    >
      <DownloadIcon />
      <span className="max-w-[240px] truncate">{attachment.name}</span>
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
  const d = new Date(ts);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

import { useState } from "react";
import type { notes } from "../../wailsjs/go/models";
import { PlusIcon, PencilIcon, TrashIcon } from "./icons";
import { RenameInput } from "./RenameInput";
import { ConfirmDialog } from "./ui/ConfirmDialog";

interface ChatListProps {
  chats: notes.Chat[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
  canDelete: boolean;
}

export function ChatList({
  chats,
  activeId,
  onSelect,
  onCreate,
  onRename,
  onDelete,
  canDelete,
}: ChatListProps) {
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const confirmChat = confirmDeleteId
    ? chats.find((c) => c.id === confirmDeleteId)
    : null;

  return (
    <div className="flex w-56 shrink-0 flex-col border-r border-[var(--border)] bg-[var(--bg-primary)]">
      <div className="flex items-center justify-between px-3 py-2.5">
        <span className="text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
          Chats
        </span>
        <button
          onClick={onCreate}
          className="flex h-6 w-6 items-center justify-center rounded-md text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
          title="New chat"
          aria-label="New chat"
        >
          <PlusIcon />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-1.5 pb-2">
        {chats.map((c) => {
          const active = c.id === activeId;
          const renaming = c.id === renamingId;
          return (
            <div
              key={c.id}
              onClick={() => !renaming && onSelect(c.id)}
              className={`group flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1.5 text-sm transition-colors ${
                active
                  ? "bg-[var(--bg-hover)] text-[var(--text-primary)]"
                  : "text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]/60"
              }`}
            >
              {renaming ? (
                <RenameInput
                  initialValue={c.title}
                  onCommit={(v) => {
                    const trimmed = v.trim();
                    if (trimmed && trimmed !== c.title) onRename(c.id, trimmed);
                    setRenamingId(null);
                  }}
                  onCancel={() => setRenamingId(null)}
                />
              ) : (
                <>
                  <span className="flex-1 truncate">{c.title}</span>
                  <span className="shrink-0 text-[10px] text-[var(--text-muted)] opacity-80 group-hover:hidden">
                    {relativeShort(c.updatedAt)}
                  </span>
                  <div className="hidden shrink-0 items-center gap-0.5 group-hover:flex">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setRenamingId(c.id);
                      }}
                      className="flex h-5 w-5 items-center justify-center rounded text-[var(--text-muted)] hover:bg-[var(--bg-primary)] hover:text-[var(--text-primary)]"
                      title="Rename"
                      aria-label="Rename chat"
                    >
                      <PencilIcon />
                    </button>
                    {canDelete && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setConfirmDeleteId(c.id);
                        }}
                        className="flex h-5 w-5 items-center justify-center rounded text-[var(--text-muted)] hover:bg-[var(--bg-primary)] hover:text-[var(--accent-red)]"
                        title="Delete"
                        aria-label="Delete chat"
                      >
                        <TrashIcon />
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>

      <ConfirmDialog
        open={confirmDeleteId !== null}
        title="Delete chat?"
        body={
          <>
            This will permanently delete{" "}
            <span className="font-medium text-[var(--text-primary)]">
              {confirmChat?.title}
            </span>{" "}
            and every message inside it.
          </>
        }
        confirmLabel="Delete"
        variant="destructive"
        onCancel={() => setConfirmDeleteId(null)}
        onConfirm={() => {
          if (confirmDeleteId) onDelete(confirmDeleteId);
          setConfirmDeleteId(null);
        }}
      />
    </div>
  );
}

function relativeShort(ts: number): string {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 604800) return `${Math.floor(s / 86400)}d`;
  return new Date(ts).toLocaleDateString([], { month: "short", day: "numeric" });
}

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { setMessageFolder, type Folder, type HistoryMessage } from "../store/messageHistory";
import { useOverlay } from "../store/overlay";
import { CheckIcon, FolderIcon, PlusIcon } from "./icons";
import { NewFolderInput } from "./NewFolderInput";

interface MessageFolderMenuProps {
  anchor: DOMRect;
  message: HistoryMessage;
  folders: Folder[];
  onClose: () => void;
}

const GAP = 6;
const MARGIN = 12;
const WIDTH = 240;

export function MessageFolderMenu({ anchor, message, folders, onClose }: MessageFolderMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [creating, setCreating] = useState(false);

  useOverlay(true);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const box = el.getBoundingClientRect();
    const left = Math.max(MARGIN, Math.min(anchor.left, window.innerWidth - MARGIN - box.width));
    let top = anchor.bottom + GAP;
    if (top + box.height > window.innerHeight - MARGIN) top = anchor.top - GAP - box.height;
    top = Math.max(MARGIN, top);
    setPos({ top, left });
  }, [anchor, folders.length, creating]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [onClose]);

  const moveTo = (folderId: string | null) => {
    setMessageFolder(message.id, folderId);
    onClose();
  };

  return createPortal(
    <div
      ref={ref}
      role="menu"
      data-history-overlay
      data-history-menu
      style={{
        position: "fixed",
        top: pos?.top ?? 0,
        left: pos?.left ?? 0,
        width: WIDTH,
        visibility: pos ? "visible" : "hidden",
      }}
      className="z-[9999] flex max-h-[300px] flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] py-1 shadow-[0_16px_48px_-12px_rgba(0,0,0,0.55)]"
    >
      <div className="px-3 py-1 text-[10px] font-medium uppercase tracking-wide text-[var(--text-muted)]">
        Move to folder
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {folders.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => moveTo(message.folderId === f.id ? null : f.id)}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-hover)]"
          >
            <span className="text-[var(--text-muted)]">
              <FolderIcon />
            </span>
            <span className="min-w-0 flex-1 truncate">{f.name}</span>
            {message.folderId === f.id && (
              <span className="text-[var(--accent-blue)]">
                <CheckIcon />
              </span>
            )}
          </button>
        ))}
        {folders.length === 0 && !creating && (
          <div className="px-3 py-2 text-xs text-[var(--text-muted)]">No folders yet</div>
        )}
      </div>

      {message.folderId && (
        <button
          type="button"
          onClick={() => moveTo(null)}
          className="flex w-full items-center gap-2 border-t border-[var(--border)] px-3 py-1.5 text-left text-[13px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)]"
        >
          Remove from folder
        </button>
      )}

      <div className="border-t border-[var(--border)]">
        {creating ? (
          <NewFolderInput
            className="w-full bg-transparent px-3 py-2 text-[13px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
            onCreated={(folder) => moveTo(folder.id)}
            onCancel={() => setCreating(false)}
          />
        ) : (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)]"
          >
            <span className="text-[var(--text-muted)]">
              <PlusIcon />
            </span>
            New folder
          </button>
        )}
      </div>
    </div>,
    document.body,
  );
}

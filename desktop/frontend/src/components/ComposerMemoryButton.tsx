import { useEffect, useState, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import { Eye, Plus } from "lucide-react";
import { useAnchoredPanel } from "../hooks/useAnchoredPanel";
import { useOverlay } from "../store/overlay";
import { relativeTime } from "../relativeTime";
import type { MemorySessionInfo } from "../hooks/useMemorySessions";
import type { MentionItem } from "../mentions";
import { BrainIcon, TrashIcon } from "./icons";
import { ConfirmDialog } from "./ui/ConfirmDialog";
import { Tooltip } from "./ui/Tooltip";
import { COMPOSER_TOOLTIP_DELAY_MS } from "../composerText";

const PANEL_WIDTH = 320;

interface ComposerMemoryButtonProps {
  // Saved sessions, newest first, as the mention pool carries them: `insert` is
  // the session id the invocation takes as its argument.
  sessions: MentionItem[];
  // Per-session detail; only the write time is shown here, next to the id.
  infoById: Map<string, MemorySessionInfo>;
  // Re-reads the session list so the panel shows what's on disk right now —
  // another agent may have written one since the composer was focused.
  onOpen: () => void;
  // Writes the chosen invocation into the composer; an empty `insert` means
  // "remember this conversation" (the bare command, no session argument).
  onPick: (item: MentionItem) => void;
  // Opens the session in the Memory tab, to read or edit it there.
  onView: (item: MentionItem) => void;
  // Removes the session file, after the user confirms here.
  onDelete: (item: MentionItem) => void;
}

// Footer control beside Drafts: the same memory pool the "@" menu drills into,
// reachable without typing. Picking a row drops the skill invocation into the
// composer for the user to review and send.
export function ComposerMemoryButton({ sessions, infoById, onOpen, onPick, onView, onDelete }: ComposerMemoryButtonProps) {
  const [open, setOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<MentionItem | null>(null);
  const { triggerRef, panelRef, style } = useAnchoredPanel<HTMLDivElement, HTMLDivElement>({
    open,
    onClose: () => setOpen(false),
    width: PANEL_WIDTH,
    side: "above",
    align: "left",
    flip: true,
  });

  useOverlay(open);

  // Escape dismisses the confirmation first, then the panel; captured so it
  // doesn't also reach the composer's own handler, which would refocus the
  // terminal underneath. The editor keeps focus throughout, so its handler —
  // which stops propagation — would otherwise swallow Escape before the dialog
  // ever saw it.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      if (pendingDelete) setPendingDelete(null);
      else setOpen(false);
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open, pendingDelete]);

  // Keep clicks from pulling focus off the composer editor; the caret stays put
  // so the invocation lands where the user was typing.
  const keepEditorFocus = (e: MouseEvent) => e.preventDefault();

  const toggle = () => {
    if (open) {
      setOpen(false);
      setPendingDelete(null);
      return;
    }
    onOpen();
    setOpen(true);
  };

  const pick = (item: MentionItem) => {
    setOpen(false);
    onPick(item);
  };

  const view = (item: MentionItem) => {
    setOpen(false);
    onView(item);
  };

  // The panel stays open afterwards: deleting is a tidy-up pass, usually more
  // than one row at a time, and the list reloads underneath.
  const confirmDelete = () => {
    if (!pendingDelete) return;
    onDelete(pendingDelete);
    setPendingDelete(null);
  };

  return (
    <div ref={triggerRef}>
      <Tooltip content="Memory" delay={COMPOSER_TOOLTIP_DELAY_MS}>
        <button
          type="button"
          onMouseDown={keepEditorFocus}
          onClick={toggle}
          aria-label="Memory"
          aria-expanded={open}
          className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${
            open
              ? "bg-[var(--composer-hover-bg)] text-[var(--composer-fg)]"
              : "text-[var(--composer-fg-muted)] hover:bg-[var(--composer-hover-bg)] hover:text-[var(--composer-fg)]"
          }`}
        >
          <BrainIcon size={15} />
        </button>
      </Tooltip>

      {open &&
        style &&
        createPortal(
          <div
            ref={panelRef}
            style={style}
            className="z-[80] flex flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] shadow-xl"
          >
            <button
              type="button"
              onMouseDown={keepEditorFocus}
              onClick={() => pick({ kind: "memory-save", label: "", insert: "" })}
              className="group flex w-full shrink-0 items-start gap-2.5 p-3 text-left transition-colors hover:bg-[var(--bg-hover)]"
            >
              <span className="mt-px flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-md bg-[var(--accent-cyan)]/12 text-[var(--accent-cyan)]">
                <Plus size={12} strokeWidth={2.25} />
              </span>
              <span className="min-w-0">
                <span className="block text-[12.5px] font-medium text-[var(--text-secondary)] group-hover:text-[var(--text-primary)]">
                  Remember this conversation
                </span>
                <span className="mt-1 block text-[11px] leading-[15px] text-[var(--text-muted)]">
                  The agent writes down the goal, decisions, and next steps — and keeps it updated
                  as you work. Any agent can continue from it later.
                </span>
              </span>
            </button>

            <div className="border-t border-[var(--border)]">
              {sessions.length === 0 ? (
                <p className="px-3 py-3 text-center text-[11px] leading-[15px] text-[var(--text-muted)]">
                  Nothing saved yet. Sessions you save show up here.
                </p>
              ) : (
                <>
                  <p className="px-3 pb-1 pt-2.5 text-[10px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
                    Continue a session
                  </p>
                  <ul className="max-h-60 min-h-0 overflow-y-auto pb-1.5">
                    {sessions.map((session) => {
                      const updatedAt = infoById.get(session.insert)?.updatedAt;
                      return (
                        <li key={session.insert} className="group/row relative">
                          <button
                            type="button"
                            onMouseDown={keepEditorFocus}
                            onClick={() => pick(session)}
                            className="group flex w-full items-center gap-2.5 px-3 py-1.5 text-left transition-colors hover:bg-[var(--bg-hover)]"
                          >
                            <span className="shrink-0 text-[var(--text-muted)] transition-colors group-hover:text-[var(--accent-cyan)]">
                              <BrainIcon />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[12.5px] leading-[17px] text-[var(--text-secondary)] group-hover:text-[var(--text-primary)]">
                                {session.label}
                              </span>
                              {session.detail && (
                                <span className="block truncate text-[11px] leading-[15px] text-[var(--text-muted)]">
                                  {session.detail}
                                </span>
                              )}
                            </span>
                            {updatedAt !== undefined && (
                              <span className="shrink-0 text-[10px] tabular-nums text-[var(--text-muted)] group-hover/row:invisible">
                                {relativeTime(updatedAt)}
                              </span>
                            )}
                          </button>
                          <span className="absolute right-2 top-1/2 hidden -translate-y-1/2 items-center gap-0.5 group-hover/row:flex">
                            <button
                              type="button"
                              onMouseDown={keepEditorFocus}
                              onClick={() => view(session)}
                              aria-label={`Open ${session.label} in Memory`}
                              className="flex h-6 w-6 items-center justify-center rounded-md text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-primary)] hover:text-[var(--accent-purple)]"
                            >
                              <Eye size={12} />
                            </button>
                            <button
                              type="button"
                              onMouseDown={keepEditorFocus}
                              onClick={() => setPendingDelete(session)}
                              aria-label={`Delete ${session.label}`}
                              className="flex h-6 w-6 items-center justify-center rounded-md text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-primary)] hover:text-[var(--accent-red)]"
                            >
                              <TrashIcon size={12} />
                            </button>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}
            </div>
          </div>,
          document.body,
        )}

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete session?"
        body={
          <>
            <span className="font-medium text-[var(--text-primary)]">
              {(pendingDelete && infoById.get(pendingDelete.insert)?.title) ||
                pendingDelete?.label}
            </span>{" "}
            will be gone for good — agents won't be able to pick this work up again.
          </>
        }
        confirmLabel="Delete"
        variant="destructive"
        zIndexClassName="z-[90]"
        onCancel={() => setPendingDelete(null)}
        onConfirm={confirmDelete}
      />
    </div>
  );
}

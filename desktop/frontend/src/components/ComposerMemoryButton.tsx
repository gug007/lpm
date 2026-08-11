import { useEffect, useMemo, useState, type KeyboardEvent, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import { Plus } from "lucide-react";
import { useAnchoredPanel } from "../hooks/useAnchoredPanel";
import { useOverlay } from "../store/overlay";
import type { MemorySessionInfo } from "../hooks/useMemorySessions";
import type { MentionItem } from "../mentions";
import type { TerminalMemoryRef } from "../terminalMemory";
import { BrainIcon, SearchIcon } from "./icons";
import { ComposerMemoryRow } from "./ComposerMemoryRow";
import { MemoryRenameDialog } from "./MemoryRenameDialog";
import { ConfirmDialog } from "./ui/ConfirmDialog";
import { Tooltip } from "./ui/Tooltip";
import { COMPOSER_TOOLTIP_DELAY_MS } from "../composerText";

const PANEL_WIDTH = 320;
// Below this the whole list is on screen at once, so a search field would cost
// a row and save nothing.
const SEARCH_FROM = 4;

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
  // Gives the session a new id, the one agents continue it by.
  onRename: (item: MentionItem, name: string) => void;
  // Removes the session file, after the user confirms here.
  onDelete: (item: MentionItem) => void;
  // The session this terminal is working under, if any: the agent was handed an
  // invocation and keeps writing there for the rest of the conversation. Absent
  // `session` while a bare "remember this conversation" waits to be named.
  attached?: TerminalMemoryRef;
  // Stops showing this terminal as recording. lpm's own marker only — the agent
  // keeps whatever it was told, so this is for a mark that has gone stale.
  onDetach: () => void;
}

// Footer control beside Drafts: the same memory pool the "@" menu drills into,
// reachable without typing. Picking a row drops the skill invocation into the
// composer for the user to review and send.
export function ComposerMemoryButton({
  sessions,
  infoById,
  onOpen,
  onPick,
  onView,
  onRename,
  onDelete,
  attached,
  onDetach,
}: ComposerMemoryButtonProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [pendingDelete, setPendingDelete] = useState<MentionItem | null>(null);
  const [pendingRename, setPendingRename] = useState<MentionItem | null>(null);
  const { triggerRef, panelRef, style } = useAnchoredPanel<HTMLDivElement, HTMLDivElement>({
    open,
    onClose: () => setOpen(false),
    width: PANEL_WIDTH,
    side: "above",
    align: "left",
    flip: true,
  });

  useOverlay(open);

  const searchable = sessions.length >= SEARCH_FROM;
  const needle = query.trim().toLowerCase();
  const visible = useMemo(
    () =>
      needle
        ? sessions.filter((s) => `${s.label} ${s.detail ?? ""}`.toLowerCase().includes(needle))
        : sessions,
    [sessions, needle],
  );

  useEffect(() => setActive(0), [needle]);

  // Escape dismisses an open dialog first, then a live search, then the panel;
  // captured so it doesn't also reach the composer's own handler, which would
  // refocus the terminal underneath. The editor keeps focus throughout, so its
  // handler — which stops propagation — would otherwise swallow Escape before
  // the dialog ever saw it.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      if (pendingDelete) setPendingDelete(null);
      else if (pendingRename) setPendingRename(null);
      else if (needle) setQuery("");
      else setOpen(false);
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open, pendingDelete, pendingRename, needle]);

  // Keep clicks from pulling focus off the composer editor; the caret stays put
  // so the invocation lands where the user was typing.
  const keepEditorFocus = (e: MouseEvent) => e.preventDefault();

  const toggle = () => {
    if (open) {
      setOpen(false);
      setPendingDelete(null);
      setPendingRename(null);
      return;
    }
    onOpen();
    setQuery("");
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

  // The search field owns the keyboard while it's focused: arrows walk the
  // filtered rows and Enter takes the highlighted one, so a session can be
  // reached without going back to the mouse.
  const onSearchKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!visible.length) return;
      const step = e.key === "ArrowDown" ? 1 : visible.length - 1;
      setActive((i) => (i + step) % visible.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = visible[active];
      if (item) pick(item);
    }
  };

  // The panel stays open afterwards: deleting is a tidy-up pass, usually more
  // than one row at a time, and the list reloads underneath.
  const confirmDelete = () => {
    if (!pendingDelete) return;
    onDelete(pendingDelete);
    setPendingDelete(null);
  };

  const confirmRename = (name: string) => {
    if (!pendingRename) return;
    onRename(pendingRename, name);
    setPendingRename(null);
  };

  // What the lit-up button says it is doing, given how much of the session is
  // known yet. Null when this terminal isn't working under one.
  const attachedText = !attached
    ? null
    : attached.session
      ? `Continuing ${infoById.get(attached.session)?.title || attached.session}`
      : "Recording a new session";

  return (
    <div ref={triggerRef}>
      <Tooltip
        content={attachedText ? `Memory  ·  ${attachedText}` : "Memory"}
        delay={COMPOSER_TOOLTIP_DELAY_MS}
      >
        <button
          type="button"
          onMouseDown={keepEditorFocus}
          onClick={toggle}
          aria-label={attachedText ?? "Memory"}
          aria-expanded={open}
          className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${
            // A terminal working under a session reads as on through the outline
            // alone — the memory accent, the same one the "/lpm-memory <id>"
            // pill uses. The glyph stays unfilled, so it still reads as a brain.
            attached
              ? "text-[var(--accent-purple)]"
              : open
                ? "text-[var(--composer-fg)]"
                : "text-[var(--composer-fg-muted)] hover:text-[var(--composer-fg)]"
          } ${open ? "bg-[var(--composer-hover-bg)]" : "hover:bg-[var(--composer-hover-bg)]"}`}
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
            {attached && (
              <div className="flex shrink-0 items-center gap-2 border-b border-[var(--border)] bg-[color-mix(in_srgb,var(--accent-purple)_8%,transparent)] px-3 py-2">
                <span className="shrink-0 text-[var(--accent-purple)]">
                  <BrainIcon size={13} />
                </span>
                <span className="min-w-0 flex-1 truncate text-[11.5px] leading-[16px] text-[var(--text-secondary)]">
                  {attachedText}
                </span>
                <button
                  type="button"
                  onMouseDown={keepEditorFocus}
                  onClick={() => {
                    setOpen(false);
                    onDetach();
                  }}
                  className="shrink-0 rounded-md px-1.5 py-0.5 text-[11px] text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                >
                  Detach
                </button>
              </div>
            )}
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
                  {searchable ? (
                    <div className="flex items-center gap-2 px-3 py-2 text-[var(--text-muted)] [&>svg]:h-3.5 [&>svg]:w-3.5">
                      <SearchIcon />
                      <input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={onSearchKey}
                        placeholder="Search sessions"
                        spellCheck={false}
                        autoFocus
                        data-text-scope=""
                        aria-label="Search sessions"
                        className="w-full bg-transparent text-[12.5px] leading-[17px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
                      />
                    </div>
                  ) : (
                    <p className="px-3 pb-1 pt-2.5 text-[10px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
                      Continue a session
                    </p>
                  )}
                  {visible.length === 0 && (
                    <p className="px-3 pb-3 pt-1 text-center text-[11px] leading-[15px] text-[var(--text-muted)]">
                      No session matches “{query.trim()}”.
                    </p>
                  )}
                  <ul className="max-h-60 min-h-0 overflow-y-auto pb-1.5">
                    {visible.map((session, i) => (
                      <ComposerMemoryRow
                        key={session.insert}
                        session={session}
                        updatedAt={infoById.get(session.insert)?.updatedAt}
                        active={session.insert === attached?.session}
                        highlighted={searchable && i === active}
                        onHover={() => setActive(i)}
                        onPick={() => pick(session)}
                        onView={() => view(session)}
                        onRename={() => setPendingRename(session)}
                        onDelete={() => setPendingDelete(session)}
                      />
                    ))}
                  </ul>
                </>
              )}
            </div>
          </div>,
          document.body,
        )}

      <MemoryRenameDialog
        open={pendingRename !== null}
        currentName={pendingRename?.insert ?? ""}
        taken={sessions.map((s) => s.insert)}
        zIndexClassName="z-[90]"
        onCancel={() => setPendingRename(null)}
        onSubmit={confirmRename}
      />

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

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { AgentSessionRef } from "../agentSession";
import { COMPOSER_TOOLTIP_DELAY_MS } from "../composerText";
import { useAnchoredPanel } from "../hooks/useAnchoredPanel";
import { useCopyLastAnswer } from "../hooks/useCopyLastAnswer";
import { useOverlay } from "../store/overlay";
import { CopyAnswerList } from "./CopyAnswerList";
import { CheckIcon, ChevronUpIcon, CopyIcon } from "./icons";
import { MENU_PANEL_CLASS } from "./ui/ContextMenuShell";
import { Tooltip } from "./ui/Tooltip";

const MENU_WIDTH = 340;

/** Floating copy pill straddling the seam between the terminal and the
 *  composer (anchored to a zero-height rail in PaneView). A terminal has no
 *  per-message layout lpm could anchor to — the agent CLI owns the screen —
 *  so the pill appears when the agent finishes an answer and hides while it
 *  works, which is the closest a PTY gets to a button under each reply. The
 *  primary half copies the last answer; the caret opens a pick-list of recent
 *  answers for reaching one from earlier in the session. Kept mounted (fading,
 *  not unmounting) so the copied flash survives the status flip when the
 *  user's next prompt starts the agent working again. */
export function TerminalCopyAnswerOverlay({
  projectName,
  session,
  show,
}: {
  projectName: string;
  session: AgentSessionRef;
  show: boolean;
}) {
  const { copied, copy, flashCopied } = useCopyLastAnswer(projectName, session);
  const [open, setOpen] = useState(false);
  const { triggerRef, panelRef, style } = useAnchoredPanel<
    HTMLDivElement,
    HTMLDivElement
  >({
    open,
    onClose: () => setOpen(false),
    width: MENU_WIDTH,
    side: "above",
  });

  useOverlay(open);

  // Escape closes the menu; captured and stopped so it doesn't also reach the
  // terminal underneath (the hook only covers outside-click).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setOpen(false);
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open]);

  // The menu can't outlive the pill: when the agent starts working the pill
  // fades, and a menu floating over nothing would linger confusingly.
  useEffect(() => {
    if (!show && open) setOpen(false);
  }, [show, open]);

  return (
    <div
      className={`absolute -top-5 right-3 z-10 transition-opacity duration-200 ${
        show ? "opacity-100" : "pointer-events-none opacity-0"
      }`}
    >
      <div
        ref={triggerRef}
        className="flex items-stretch rounded-full border border-[var(--composer-border)] bg-[var(--composer-surface)] text-[11px] font-medium text-[var(--composer-fg-muted)] opacity-80 shadow-sm transition-opacity hover:opacity-100"
      >
        <Tooltip content="Copy last answer" delay={COMPOSER_TOOLTIP_DELAY_MS}>
          <button
            type="button"
            // Keep the terminal focused: the copy itself never needs focus,
            // and a focus flip would blur xterm mid-session.
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => void copy()}
            aria-label="Copy last answer"
            className="flex items-center gap-1.5 rounded-l-full py-1 pl-2.5 pr-2 transition-colors hover:text-[var(--composer-fg)]"
          >
            {copied ? (
              <span className="text-[var(--accent-blue)]">
                <CheckIcon />
              </span>
            ) : (
              <CopyIcon size={12} />
            )}
            {copied ? "Copied" : "Copy"}
          </button>
        </Tooltip>
        <span className="my-1 w-px bg-[var(--composer-border)]" />
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setOpen((v) => !v)}
          aria-label="Copy an earlier answer"
          aria-haspopup="menu"
          aria-expanded={open}
          className={`flex items-center rounded-r-full pl-1 pr-2 transition-colors hover:text-[var(--composer-fg)] [&>svg]:h-3 [&>svg]:w-3 ${
            open ? "text-[var(--composer-fg)]" : ""
          }`}
        >
          <ChevronUpIcon />
        </button>
      </div>

      {open &&
        style &&
        createPortal(
          <div
            ref={panelRef}
            role="menu"
            style={style}
            className={`z-[80] ${MENU_PANEL_CLASS}`}
          >
            <CopyAnswerList
              projectName={projectName}
              session={session}
              onCopied={() => {
                setOpen(false);
                flashCopied();
              }}
            />
          </div>,
          document.body,
        )}
    </div>
  );
}

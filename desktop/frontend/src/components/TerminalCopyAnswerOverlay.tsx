import type { AgentSessionRef } from "../agentSession";
import { COMPOSER_TOOLTIP_DELAY_MS } from "../composerText";
import { useCopyLastAnswer } from "../hooks/useCopyLastAnswer";
import { CheckIcon, CopyIcon } from "./icons";
import { Tooltip } from "./ui/Tooltip";

/** Floating "Copy" pill straddling the seam between the terminal and the
 *  composer (anchored to a zero-height rail in PaneView). A terminal has no
 *  per-message layout lpm could anchor to — the agent CLI owns the screen —
 *  so the pill appears when the agent finishes an answer and hides while it
 *  works, which is the closest a PTY gets to a button under each reply. Kept
 *  mounted (fading, not unmounting) so the copied flash survives the status
 *  flip when the user's next prompt starts the agent working again. */
export function TerminalCopyAnswerOverlay({
  projectName,
  session,
  show,
}: {
  projectName: string;
  session: AgentSessionRef;
  show: boolean;
}) {
  const { copied, copy } = useCopyLastAnswer(projectName, session);

  return (
    <div
      className={`absolute -top-5 right-3 z-10 transition-opacity duration-200 ${
        show ? "opacity-100" : "pointer-events-none opacity-0"
      }`}
    >
      <Tooltip content="Copy last answer" delay={COMPOSER_TOOLTIP_DELAY_MS}>
        <button
          type="button"
          // Keep the terminal focused: the copy itself never needs focus, and
          // a focus flip would blur xterm mid-session.
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => void copy()}
          aria-label="Copy last answer"
          className="flex items-center gap-1.5 rounded-full border border-[var(--composer-border)] bg-[var(--composer-surface)] py-1 pl-2.5 pr-3 text-[11px] font-medium text-[var(--composer-fg-muted)] opacity-80 shadow-sm transition-all hover:opacity-100 hover:text-[var(--composer-fg)]"
        >
          {copied ? (
            <span className="text-[var(--accent-green)]">
              <CheckIcon />
            </span>
          ) : (
            <CopyIcon size={12} />
          )}
          {copied ? "Copied" : "Copy"}
        </button>
      </Tooltip>
    </div>
  );
}

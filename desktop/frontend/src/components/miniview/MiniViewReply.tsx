import { useState } from "react";
import { answerAgentDialog } from "../../agentDialogScreen";
import type { AgentDialog } from "../../agentDialog";
import { deliverInput } from "../terminal/deliverInput";
import { isImeComposing } from "../../imeComposing";
import { toast } from "../../notifications/toast";
import { interactiveSessions } from "../InteractivePane";

// Choices past this many are left to the tab itself, so the view stays small.
const CHOICES_SHOWN = 3;

/** How a mini view answers its agent: a choice it offers on screen, picked in
 *  one click, or a one-line reply while it waits on a question. */
export function MiniViewReply({
  terminalId,
  agentName,
  dialog,
  waiting,
}: {
  terminalId: string;
  agentName: string;
  dialog: AgentDialog | null;
  waiting: boolean;
}) {
  const [text, setText] = useState("");

  if (dialog && dialog.options.length > 0) {
    return (
      <div className="flex flex-wrap gap-1 border-t border-[var(--border)] px-2 py-1.5">
        {dialog.options.slice(0, CHOICES_SHOWN).map((option) => (
          <button
            key={option.key}
            type="button"
            title={option.label}
            onClick={(e) => {
              e.stopPropagation();
              answerAgentDialog(terminalId, dialog, option).catch((err) =>
                toast.error(`Couldn't answer: ${String(err)}`),
              );
            }}
            className="min-w-0 max-w-full truncate rounded-md border border-[var(--border)] bg-[var(--bg-primary)] px-2 py-0.5 text-[11px] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
          >
            {option.key}. {option.label}
          </button>
        ))}
      </div>
    );
  }
  if (!waiting) return null;

  const send = () => {
    const session = interactiveSessions.get(terminalId);
    if (!text.trim() || !session) return;
    if (deliverInput(session, terminalId, text)) setText("");
  };
  return (
    <div className="border-t border-[var(--border)] px-2 py-1.5" onClick={(e) => e.stopPropagation()}>
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !isImeComposing(e)) {
            e.preventDefault();
            send();
          } else if (e.key === "Escape") {
            e.currentTarget.blur();
          }
        }}
        placeholder={`Reply to ${agentName}…`}
        aria-label={`Reply to ${agentName}`}
        spellCheck={false}
        className="w-full rounded-md border border-[var(--border)] bg-[var(--bg-primary)] px-2 py-1 font-mono text-[11px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--text-muted)]"
      />
    </div>
  );
}

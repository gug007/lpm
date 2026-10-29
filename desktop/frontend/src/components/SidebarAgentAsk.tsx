import { useEffect, useState } from "react";
import { sameDialog, type AgentDialog, type AgentDialogOption } from "../agentDialog";
import { answerAgentDialog, useAgentDialog } from "../agentDialogScreen";
import { toast } from "../notifications/toast";

// How long a picked answer may leave the same dialog on screen before the card
// says it didn't reach the agent.
const NO_EFFECT_MS = 2500;

interface SidebarAgentAskProps {
  terminalId: string;
  lead: string;
  onOpen: () => void;
}

/** Under a task waiting on the user: what its agent asks, read off its
 *  terminal, with the agent's own choices to answer from here. */
export function SidebarAgentAsk({ terminalId, lead, onOpen }: SidebarAgentAskProps) {
  const dialog = useAgentDialog(terminalId);
  const [sent, setSent] = useState<AgentDialog | null>(null);
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    if (!sent) return;
    if (!sameDialog(dialog, sent)) {
      setSent(null);
      setStuck(false);
      return;
    }
    const timer = setTimeout(() => setStuck(true), NO_EFFECT_MS);
    return () => clearTimeout(timer);
  }, [sent, dialog]);

  if (!dialog) return null;

  const answer = async (option: AgentDialogOption) => {
    try {
      const result = await answerAgentDialog(terminalId, dialog, option);
      if (result === "changed") {
        toast("The question changed. Check it again before answering.");
        return;
      }
      setStuck(false);
      setSent(dialog);
      if (option.typed) onOpen();
    } catch (err) {
      toast.error(`Couldn't answer: ${String(err)}`);
    }
  };

  return (
    <div className={`${lead} pb-1.5 pr-2`}>
      <div className="ml-4 flex flex-col gap-1.5 rounded-md border border-[var(--accent-amber)]/30 bg-[var(--accent-amber)]/[0.06] px-2 py-1.5">
        {dialog.question && (
          <div className="text-[11.5px] font-medium leading-snug text-[var(--text-primary)]">{dialog.question}</div>
        )}
        {dialog.details.map((detail) => (
          <div
            key={detail}
            title={detail}
            className="truncate font-mono text-[10.5px] leading-snug text-[var(--text-secondary)]"
          >
            {detail}
          </div>
        ))}
        <div className="flex flex-col gap-0.5" role="group" aria-label="Answers">
          {dialog.options.map((option, i) => (
            <button
              key={option.key}
              type="button"
              disabled={sent !== null && !stuck}
              title={option.description ? `${option.label}\n${option.description}` : option.label}
              onClick={() => void answer(option)}
              className={`flex min-w-0 items-center gap-1.5 rounded px-1.5 py-0.5 text-left text-[11px] transition-colors disabled:opacity-50 ${
                i === 0
                  ? "bg-[var(--text-primary)] text-[var(--bg-primary)] hover:opacity-90"
                  : "text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
              }`}
            >
              <span className="shrink-0 tabular-nums opacity-60">{option.key}</span>
              <span className="min-w-0 truncate">{option.label}</span>
            </button>
          ))}
        </div>
        {stuck && (
          <div className="text-[10.5px] leading-snug text-[var(--text-muted)]">
            That didn't reach the agent.{" "}
            <button type="button" onClick={onOpen} className="underline underline-offset-2 hover:text-[var(--text-primary)]">
              Answer in the terminal
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

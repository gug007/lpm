import { TerminalIcon } from "./icons";
import { AGENT_STATE_LABEL, AGENT_STATE_TONE, type AgentState } from "../agentStatus";
import type { SendTargetRow } from "../sendTargets";

interface SendTargetItemProps {
  row: SendTargetRow;
  state?: AgentState;
  active: boolean;
  disabled: boolean;
  // Why this tab can't take the prompt, shown in place of the agent's state.
  blockedReason?: string;
  // What clicking the row does. The other verb sits in the trailing button.
  primary: "send" | "move";
  onPick: (row: SendTargetRow, mode: "send" | "move") => void;
  onHover: () => void;
}

const OTHER_LABEL = { send: "Move", move: "Send anyway" } as const;

// One tab in the send picker: its name, what its agent is doing, and the second
// verb. A tab whose agent has a permission prompt open leads with Move — the
// carriage return a send ends with would answer that dialog — and keeps its
// "Send anyway" in view rather than behind a hover.
export function SendTargetItem({
  row,
  state,
  active,
  disabled,
  blockedReason,
  primary,
  onPick,
  onHover,
}: SendTargetItemProps) {
  const other = primary === "send" ? "move" : "send";
  return (
    <div
      className={`group relative flex w-full items-center ${
        active ? "bg-[var(--bg-hover)]" : ""
      }`}
      onMouseEnter={onHover}
    >
      <button
        type="button"
        data-active={active}
        onClick={() => onPick(row, primary)}
        disabled={disabled}
        className={`flex min-w-0 flex-1 items-center gap-2.5 py-2 pl-4 pr-2 text-left text-[13px] transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
          active ? "text-[var(--text-primary)]" : "text-[var(--text-secondary)]"
        }`}
      >
        <span className="flex h-4 w-4 shrink-0 items-center justify-center text-[var(--text-muted)]">
          {row.emoji || <TerminalIcon />}
        </span>
        <span className="min-w-0 flex-1 truncate">{row.label}</span>
        {blockedReason ? (
          <span className="shrink-0 text-[11px] text-[var(--text-muted)]">{blockedReason}</span>
        ) : (
          state && (
            <span className={`shrink-0 text-[11px] ${AGENT_STATE_TONE[state]}`}>
              {AGENT_STATE_LABEL[state]}
            </span>
          )
        )}
      </button>
      <button
        type="button"
        tabIndex={-1}
        onClick={() => onPick(row, other)}
        disabled={disabled}
        className={`mr-2 shrink-0 rounded-md px-1.5 py-0.5 text-[11px] text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-active)] hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-40 ${
          primary === "move" || active ? "" : "opacity-0 group-hover:opacity-100"
        }`}
      >
        {OTHER_LABEL[primary]}
      </button>
    </div>
  );
}

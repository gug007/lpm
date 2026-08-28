import { GRID, LABEL, OptionCard, Plate, agentMark, onRadioKey } from "./OptionCard";

interface ToolkitRunModeProps {
  // The CLI that reads the folder the skill sits in, for the mark on the
  // agent's card.
  cli: string;
  // The folder is the one three CLIs read, so only Codex honours the opt-out.
  shared: boolean;
  manual: boolean;
  manualAllowed: boolean;
  onManual: (manual: boolean) => void;
  invocation: string;
}

// Whether the agent may reach for the skill on its own, or only the user may
// ask for it by name. Shared by the create form and the detail view, so the
// wording of a promise lpm makes about a skill is written once.
export function ToolkitRunMode({
  cli,
  shared,
  manual,
  manualAllowed,
  onManual,
  invocation,
}: ToolkitRunModeProps) {
  // The shared folder is read by three CLIs and only Codex is holding back, so
  // saying "agents never trigger it" there would be a promise lpm cannot keep.
  const manualNote = !manualAllowed
    ? "Skills here always stay open to the agent."
    : shared
      ? `Runs when you type ${invocation} — only Codex holds it back. Gemini and OpenCode still pick it up on their own.`
      : `Runs when you type ${invocation} — agents never trigger it, and it costs no context.`;

  return (
    <div className="flex flex-col gap-1">
      <span className={LABEL}>Who runs it</span>
      <div role="radiogroup" aria-label="Who runs it" className={GRID} onKeyDown={onRadioKey}>
        {/* The marks carry the answer twice over: the agent that reads the
            chosen folder, against the prompt the user types at. */}
        <OptionCard
          on={!manual}
          tabIndex={manual ? -1 : 0}
          tone="mode"
          mark={<Plate kind={agentMark(cli, shared)} quiet />}
          title="Your agent, when it fits"
          note="Picked up on its own whenever the description matches the task."
          onPick={() => onManual(false)}
        />
        <OptionCard
          on={manual}
          tabIndex={manual ? 0 : -1}
          tone="mode"
          mark={<Plate kind="prompt" quiet />}
          disabled={!manualAllowed}
          title="Only you"
          note={manualNote}
          onPick={() => onManual(true)}
        />
      </div>
    </div>
  );
}

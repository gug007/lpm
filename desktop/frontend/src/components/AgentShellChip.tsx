import { shellsLabel, type AgentPause } from "../agentPause";
import { PauseIcon } from "./icons";

/** "1 shell" — what a paused agent waits on, where a mark and a clock would
 *  otherwise say how its turn is going. */
export function AgentShellChip({
  pause,
  glyph = true,
  className = "",
}: {
  pause: AgentPause;
  glyph?: boolean;
  className?: string;
}) {
  return (
    <span
      data-agent-shells={pause.shells.length}
      className={`flex h-4 shrink-0 items-center gap-1 whitespace-nowrap rounded-[5px] bg-[color-mix(in_srgb,var(--accent-violet)_18%,transparent)] px-1.5 text-[10.5px] font-medium leading-none text-[var(--accent-violet-text)] ${className}`}
    >
      {glyph && <PauseIcon />}
      {shellsLabel(pause)}
    </span>
  );
}

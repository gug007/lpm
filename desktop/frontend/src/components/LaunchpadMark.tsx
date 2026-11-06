import type { AICLI } from "../types";
import { EmojiMark } from "./EmojiMark";
import { AgentGlyph } from "./terminal/AgentGlyph";

/** What leads a launchpad option: its action's emoji, as the header shows it, so
 *  variants sharing a label stay apart, else the agent's mark. An emoji draws wider
 *  than its font size, so it overhangs the mark's slot to keep a list's labels lined
 *  up; anything longer than one emoji still widens the slot instead of covering them. */
export function LaunchpadMark({ agent, emoji, size = 16 }: { agent: AICLI; emoji?: string; size?: number }) {
  if (!emoji) return <AgentGlyph agent={agent} size={size} />;
  return (
    <span className="flex shrink-0 justify-center" style={{ minWidth: size }}>
      <span className="-mx-0.5 flex items-center">
        <EmojiMark emoji={emoji} size={size} />
      </span>
    </span>
  );
}

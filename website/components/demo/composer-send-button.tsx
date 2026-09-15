"use client";

import { Send } from "lucide-react";
import { Tooltip } from "./tooltip";
import { FOCUS_RING, PRESS } from "./ui";

const PILL = "flex h-7 shrink-0 items-center justify-center rounded-lg pl-2.5 pr-2";

const glow = (accent: string) => ({
  boxShadow: `0 2px 12px -2px color-mix(in srgb, ${accent} 60%, transparent)`,
});

/** The composer's send control: a glowing accent pill, a quiet neutral shell
 *  with nothing to send. There is no Stop here — a turn in flight is interrupted
 *  by sending the next prompt, and the terminal itself owns Ctrl+C. */
export function ComposerSendButton({
  disabled,
}: {
  disabled: boolean;
}) {
  return (
    <Tooltip content={"Send  ·  ↵"} delay={500} triggerClassName="inline-flex shrink-0">
      <button
        type="submit"
        disabled={disabled}
        aria-label="Send"
        style={disabled ? undefined : glow("#60a5fa")}
        className={`${PILL} [&>svg]:rotate-45 ${PRESS} ${FOCUS_RING} ${
          disabled
            ? "bg-[rgba(204,204,204,0.12)] text-[#8e8e8e]"
            : "bg-[#60a5fa] text-[#1a1a1a] hover:brightness-110"
        }`}
      >
        <Send className="h-3.5 w-3.5" />
      </button>
    </Tooltip>
  );
}

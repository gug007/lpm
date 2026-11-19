import type { MouseEvent } from "react";
import type { ComposerToolVariant } from "../composerTools";
import type { AICLI } from "../types";
import { COMPOSER_TOOLTIP_DELAY_MS } from "../composerText";
import { COMPOSER_TOOL_BUTTON_CLASS } from "./composerToolStyles";
import { VideoIcon } from "./icons";
import { ContextMenuItem } from "./ui/ContextMenuItem";
import { Tooltip } from "./ui/Tooltip";
import { VideoAnswerPreview } from "./VideoAnswerPreview";

export interface ComposerVideoButtonProps {
  on: boolean;
  onToggle: () => void;
  // Why this terminal can't make a video. The button then says so instead of
  // acting, rather than disappearing and leaving the feature a mystery.
  offReason: string | null;
  // The agent the answer would come from, whose mark its tooltip shows.
  agent: AICLI | null;
  variant?: ComposerToolVariant;
  // Row only: the menu holding the row, told to fold away once picked.
  onPick?: () => void;
}

const ON_CLASS =
  "flex h-7 w-7 items-center justify-center rounded-lg bg-[color-mix(in_srgb,var(--accent-violet)_18%,transparent)] text-[var(--accent-violet)] transition-colors";

// Turns the next prompt into a request for a narrated video of the answer.
export function ComposerVideoButton({ on, onToggle, offReason, agent, variant = "button", onPick }: ComposerVideoButtonProps) {
  const blocked = offReason !== null;
  const label = on ? "Back to a text answer" : "Answer as a video";
  // Don't pull focus off the composer editor: the prompt is typed next.
  const keepEditorFocus = (e: MouseEvent) => e.preventDefault();

  if (variant === "row") {
    return (
      <ContextMenuItem
        label={label}
        description={offReason ?? undefined}
        icon={<VideoIcon size={13} />}
        onMouseDown={keepEditorFocus}
        onClick={() => {
          onPick?.();
          onToggle();
        }}
        disabled={blocked}
      />
    );
  }
  // Off, the tooltip shows what the button does by example; on, or where it
  // can't be used, it says in one line how to go back or why.
  const explains = !blocked && !on;
  return (
    <Tooltip
      content={explains ? <VideoAnswerPreview agent={agent} /> : (offReason ?? label)}
      delay={COMPOSER_TOOLTIP_DELAY_MS}
      wide={explains}
    >
      <button
        type="button"
        onMouseDown={keepEditorFocus}
        onClick={() => {
          if (!blocked) onToggle();
        }}
        aria-label="Answer as a video"
        aria-pressed={on}
        aria-disabled={blocked}
        className={on ? ON_CLASS : `${COMPOSER_TOOL_BUTTON_CLASS} ${blocked ? "cursor-default opacity-40" : ""}`}
      >
        <VideoIcon />
      </button>
    </Tooltip>
  );
}

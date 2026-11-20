import type { MouseEvent } from "react";
import type { AnswerKind } from "../answerKind";
import { COMPOSER_TOOL_LABEL, type ComposerToolVariant } from "../composerTools";
import { COMPOSER_TOOLTIP_DELAY_MS } from "../composerText";
import type { AICLI } from "../types";
import { ANSWER_CARD_FOOT_BG } from "./AnswerCardFoot";
import { AnswerKindIcon } from "./AnswerKindIcon";
import { COMPOSER_TOOL_BUTTON_CLASS, COMPOSER_TOOL_ON_CLASS } from "./composerToolStyles";
import { CheckIcon } from "./icons";
import { ImageAnswerPreview } from "./ImageAnswerPreview";
import { ContextMenuItem } from "./ui/ContextMenuItem";
import { Tooltip } from "./ui/Tooltip";
import { VideoAnswerPreview } from "./VideoAnswerPreview";

export interface ComposerAnswerButtonProps {
  kind: AnswerKind;
  on: boolean;
  onToggle: () => void;
  // Why this terminal can't ask for it. The tool then says so instead of
  // acting, rather than disappearing and leaving the feature a mystery.
  offReason: string | null;
  // The agent the answer would come from, whose mark its hover card shows.
  agent: AICLI | null;
  variant?: ComposerToolVariant;
  // Row only: the menu holding the row, told to fold away once picked.
  onPick?: () => void;
}

// Turns the next prompt into a request for a video or an image instead
// of a text answer, and back. Its hover card shows what it does by example, on
// or off, ending on what makes the answer and a Settings link the pointer can
// reach; where it can't be used, it says why in one line.
export function ComposerAnswerButton({ kind, on, onToggle, offReason, agent, variant = "button", onPick }: ComposerAnswerButtonProps) {
  const blocked = offReason !== null;
  const label = COMPOSER_TOOL_LABEL[kind];
  // Don't pull focus off the composer editor: the prompt is typed next.
  const keepEditorFocus = (e: MouseEvent) => e.preventDefault();

  if (variant === "row") {
    return (
      <ContextMenuItem
        label={label}
        description={offReason ?? undefined}
        icon={<AnswerKindIcon kind={kind} size={13} />}
        trailing={on ? <span className="text-[var(--accent-violet)]"><CheckIcon /></span> : undefined}
        onMouseDown={keepEditorFocus}
        onClick={() => {
          onPick?.();
          onToggle();
        }}
        disabled={blocked}
      />
    );
  }
  const tooltip = blocked
    ? { content: offReason }
    : {
        content:
          kind === "video" ? (
            <VideoAnswerPreview agent={agent} on={on} />
          ) : (
            <ImageAnswerPreview agent={agent} on={on} />
          ),
        wide: true,
        flush: true,
        arrow: ANSWER_CARD_FOOT_BG,
        interactive: true,
      };
  return (
    <Tooltip {...tooltip} delay={COMPOSER_TOOLTIP_DELAY_MS}>
      <button
        type="button"
        onMouseDown={keepEditorFocus}
        onClick={() => {
          if (!blocked) onToggle();
        }}
        aria-label={label}
        aria-pressed={on}
        aria-disabled={blocked}
        className={on ? COMPOSER_TOOL_ON_CLASS : `${COMPOSER_TOOL_BUTTON_CLASS} ${blocked ? "cursor-default opacity-40" : ""}`}
      >
        <AnswerKindIcon kind={kind} />
      </button>
    </Tooltip>
  );
}

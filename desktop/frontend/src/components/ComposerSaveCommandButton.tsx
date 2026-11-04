import { BookmarkPlus } from "lucide-react";
import { COMPOSER_TOOL_LABEL, type ComposerToolVariant } from "../composerTools";
import { COMPOSER_TOOLTIP_DELAY_MS } from "../composerText";
import { COMPOSER_TOOL_BUTTON_CLASS } from "./composerToolStyles";
import { ContextMenuItem } from "./ui/ContextMenuItem";
import { Tooltip } from "./ui/Tooltip";

interface ComposerSaveCommandButtonProps {
  variant?: ComposerToolVariant;
  disabled: boolean;
  onClick: () => void;
}

const LABEL = COMPOSER_TOOL_LABEL.saveCommand;

// Turns the prompt in the input into an lpm skill: the Skills tab opens with a
// new skill holding it, ready for a name and a folder.
export function ComposerSaveCommandButton({ variant = "button", disabled, onClick }: ComposerSaveCommandButtonProps) {
  if (variant === "row") {
    return (
      <ContextMenuItem
        label={LABEL}
        description={disabled ? "Type a prompt first" : "Run it later by typing /name"}
        icon={<BookmarkPlus size={13} />}
        disabled={disabled}
        onClick={onClick}
      />
    );
  }
  return (
    <Tooltip content={disabled ? "Type a prompt first" : LABEL} delay={COMPOSER_TOOLTIP_DELAY_MS}>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-label={LABEL}
        className={`${COMPOSER_TOOL_BUTTON_CLASS} disabled:opacity-40`}
      >
        <BookmarkPlus size={15} />
      </button>
    </Tooltip>
  );
}

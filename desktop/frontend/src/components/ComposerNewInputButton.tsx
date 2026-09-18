import type { ComposerToolVariant } from "../composerTools";
import { COMPOSER_TOOLTIP_DELAY_MS } from "../composerText";
import { COMPOSER_TOOL_BUTTON_CLASS } from "./composerToolStyles";
import { PlusIcon } from "./icons";
import { ContextMenuItem } from "./ui/ContextMenuItem";
import { Tooltip } from "./ui/Tooltip";

interface ComposerNewInputButtonProps {
  variant?: ComposerToolVariant;
  onClick: () => void;
}

const SHORTCUT = "⌘⇧T";

// Opens another prompt tab in the composer, so a second draft can be written
// without losing the first.
export function ComposerNewInputButton({ variant = "button", onClick }: ComposerNewInputButtonProps) {
  if (variant === "row") {
    return <ContextMenuItem label="New prompt" shortcut={SHORTCUT} icon={<PlusIcon />} onClick={onClick} />;
  }
  return (
    <Tooltip content={`New prompt  ·  ${SHORTCUT}`} delay={COMPOSER_TOOLTIP_DELAY_MS}>
      <button type="button" onClick={onClick} aria-label="New input" className={COMPOSER_TOOL_BUTTON_CLASS}>
        <PlusIcon />
      </button>
    </Tooltip>
  );
}

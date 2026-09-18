import { Copy, GitFork } from "lucide-react";
import { COMPOSER_TOOL_LABEL, type ComposerToolVariant } from "../composerTools";
import { COMPOSER_TOOLTIP_DELAY_MS } from "../composerText";
import { COMPOSER_TOOL_BUTTON_CLASS } from "./composerToolStyles";
import { ContextMenuItem } from "./ui/ContextMenuItem";
import { Tooltip } from "./ui/Tooltip";

interface ComposerForkButtonProps {
  kind: "fork" | "forkCopy";
  variant?: ComposerToolVariant;
  onClick: () => void;
}

const DESCRIPTION = {
  fork: "Continue this conversation in a new tab",
  forkCopy: "Continue it in a copy of the project",
} as const;

// Forks the terminal's agent session: into a new tab here, or into a fresh
// copy of the project. The same two moves the tab's right-click menu offers.
export function ComposerForkButton({ kind, variant = "button", onClick }: ComposerForkButtonProps) {
  const label = COMPOSER_TOOL_LABEL[kind];
  if (variant === "row") {
    const icon = kind === "fork" ? <GitFork size={13} /> : <Copy size={13} />;
    return <ContextMenuItem label={label} description={DESCRIPTION[kind]} icon={icon} onClick={onClick} />;
  }
  return (
    <Tooltip content={label} delay={COMPOSER_TOOLTIP_DELAY_MS}>
      <button type="button" onClick={onClick} aria-label={label} className={COMPOSER_TOOL_BUTTON_CLASS}>
        {kind === "fork" ? <GitFork size={15} /> : <Copy size={15} />}
      </button>
    </Tooltip>
  );
}

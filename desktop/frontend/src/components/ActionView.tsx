import type { MouseEvent } from "react";
import { ActionButton } from "./ActionButton";
import { SplitButton } from "./SplitButton";
import { Tooltip } from "./ui/Tooltip";
import { Combo } from "./KeyCombo";
import type { ActionInfo } from "../types";
import { withEmoji } from "../withEmoji";
import { actionButtonStyle } from "../actionColors";
import { formatShortcut, parseShortcut } from "../shortcutParse";
import { COMPOSER_TOOLTIP_DELAY_MS } from "../composerText";

interface ActionViewProps {
  action: ActionInfo;
  compact: boolean;
  disabled: boolean;
  onRun: (action: ActionInfo) => void;
  onContextMenu?: (e: MouseEvent, action: ActionInfo) => void;
  scope?: string;
}

export function ActionView({ action, compact, disabled, onRun, onContextMenu, scope }: ActionViewProps) {
  const handleContextMenu = onContextMenu ? (e: MouseEvent) => onContextMenu(e, action) : undefined;

  if (action.children?.length) {
    return (
      <SplitButton
        action={action}
        disabled={disabled}
        onRunAction={onRun}
        onContextMenu={handleContextMenu}
        compact={compact}
        scope={scope}
      />
    );
  }
  const displayLabel = withEmoji(action.emoji, action.label);
  const parsedShortcut =
    action.cmd && action.shortcut ? parseShortcut(action.shortcut) : null;
  const shortcutLabel = parsedShortcut ? formatShortcut(parsedShortcut) : null;
  if (compact) {
    return (
      <button
        onClick={() => onRun(action)}
        onContextMenu={handleContextMenu}
        disabled={disabled}
        title={
          shortcutLabel ? `${displayLabel}  ·  ${shortcutLabel}` : displayLabel
        }
        style={actionButtonStyle(action.color)}
        className="flex cursor-grab select-none items-center rounded-md border border-[var(--composer-border)] bg-[var(--action-tint,var(--composer-surface))] px-2.5 py-1 text-[11px] font-medium text-[var(--composer-fg-secondary)] transition-all duration-100 hover:bg-[var(--action-tint-strong,var(--composer-hover-bg))] hover:text-[var(--composer-fg)] active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40"
      >
        {displayLabel}
      </button>
    );
  }
  const button = (
    <ActionButton
      onClick={() => onRun(action)}
      onContextMenu={handleContextMenu}
      disabled={disabled}
      variant="secondary"
      label={displayLabel}
      color={action.color}
    />
  );
  if (!shortcutLabel) return button;
  return (
    <Tooltip
      content={
        <span className="flex items-center gap-2">
          {displayLabel}
          <Combo label={shortcutLabel} />
        </span>
      }
      side="top"
      delay={COMPOSER_TOOLTIP_DELAY_MS}
    >
      {button}
    </Tooltip>
  );
}

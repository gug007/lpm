import type { MouseEvent } from "react";
import { ActionButton } from "./ActionButton";
import { SplitButton } from "./SplitButton";
import type { ActionInfo } from "../types";
import { withEmoji } from "../withEmoji";
import { actionButtonStyle } from "../actionColors";

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
  if (compact) {
    return (
      <button
        onClick={() => onRun(action)}
        onContextMenu={handleContextMenu}
        disabled={disabled}
        title={displayLabel}
        style={actionButtonStyle(action.color)}
        className="flex cursor-grab select-none items-center rounded-md border border-[var(--border)] bg-[var(--bg-secondary)] px-2.5 py-1 text-[11px] font-medium text-[var(--text-secondary)] transition-all duration-100 hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40"
      >
        {displayLabel}
      </button>
    );
  }
  return (
    <ActionButton
      onClick={() => onRun(action)}
      onContextMenu={handleContextMenu}
      disabled={disabled}
      variant="secondary"
      label={displayLabel}
      color={action.color}
    />
  );
}

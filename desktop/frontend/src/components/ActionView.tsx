import type { MouseEvent } from "react";
import { ActionButton } from "./ActionButton";
import { SplitButton } from "./SplitButton";
import type { ActionInfo } from "../types";

interface ActionViewProps {
  action: ActionInfo;
  compact: boolean;
  disabled: boolean;
  onRun: (action: ActionInfo) => void;
  onContextMenu?: (e: MouseEvent, action: ActionInfo) => void;
}

export function ActionView({ action, compact, disabled, onRun, onContextMenu }: ActionViewProps) {
  const handleContextMenu = onContextMenu ? (e: MouseEvent) => onContextMenu(e, action) : undefined;

  if (action.children?.length) {
    return (
      <SplitButton
        action={action}
        disabled={disabled}
        onRunAction={onRun}
        onContextMenu={handleContextMenu}
        compact={compact}
      />
    );
  }
  if (compact) {
    return (
      <button
        onClick={() => onRun(action)}
        onContextMenu={handleContextMenu}
        disabled={disabled}
        title={action.label}
        className="flex select-none items-center rounded-md border border-[var(--border)] bg-[var(--bg-secondary)] px-2.5 py-1 text-[11px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-40"
      >
        {action.label}
      </button>
    );
  }
  return (
    <ActionButton
      onClick={() => onRun(action)}
      onContextMenu={handleContextMenu}
      disabled={disabled}
      variant="secondary"
      label={action.label}
    />
  );
}

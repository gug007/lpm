import { ActionButton } from "./ActionButton";
import { SplitButton } from "./SplitButton";
import type { ActionInfo } from "../types";

interface ActionViewProps {
  action: ActionInfo;
  compact: boolean;
  disabled: boolean;
  onRun: (action: ActionInfo) => void;
}

export function ActionView({ action, compact, disabled, onRun }: ActionViewProps) {
  if (action.children?.length) {
    return <SplitButton action={action} disabled={disabled} onRunAction={onRun} compact={compact} />;
  }
  if (compact) {
    return (
      <button
        onClick={() => onRun(action)}
        disabled={disabled}
        title={action.label}
        className="flex items-center rounded-md border border-[var(--border)] bg-[var(--bg-secondary)] px-2.5 py-1 text-[11px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-40"
      >
        {action.label}
      </button>
    );
  }
  return (
    <ActionButton
      onClick={() => onRun(action)}
      disabled={disabled}
      variant="secondary"
      label={action.label}
    />
  );
}

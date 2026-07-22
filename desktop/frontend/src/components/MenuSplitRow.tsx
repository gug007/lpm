import type { ReactNode } from "react";
import { ChevronRightIcon } from "./icons";

export function MenuSplitRow({
  icon,
  label,
  onRun,
  onConfigure,
  disabled = false,
  hasDefault = true,
}: {
  icon: ReactNode;
  label: ReactNode;
  onRun: () => void;
  onConfigure: () => void;
  disabled?: boolean;
  hasDefault?: boolean;
}) {
  if (!hasDefault) {
    return (
      <button
        onClick={onConfigure}
        disabled={disabled}
        className="mx-1.5 flex w-[calc(100%-12px)] items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-40"
      >
        {icon}
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <span className="flex shrink-0 text-[var(--text-muted)]">
          <ChevronRightIcon />
        </span>
      </button>
    );
  }
  return (
    <div className="mx-1.5 flex items-center overflow-hidden rounded-lg">
      <button
        onClick={onRun}
        disabled={disabled}
        className="flex flex-1 items-center gap-2.5 px-2.5 py-2 text-left text-[13px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-40"
      >
        {icon}
        {label}
      </button>
      <button
        onClick={onConfigure}
        disabled={disabled}
        title="Configure"
        className="flex items-center border-l border-[var(--border)] px-2.5 py-2 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-40"
      >
        <ChevronRightIcon />
      </button>
    </div>
  );
}

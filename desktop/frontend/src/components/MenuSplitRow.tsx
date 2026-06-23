import type { ReactNode } from "react";
import { ChevronRightIcon } from "./icons";

export function MenuSplitRow({
  icon,
  label,
  onRun,
  onConfigure,
  disabled = false,
}: {
  icon: ReactNode;
  label: ReactNode;
  onRun: () => void;
  onConfigure: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center">
      <button
        onClick={onRun}
        disabled={disabled}
        className="flex flex-1 items-center gap-2.5 px-4 py-2 text-left text-[13px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-40"
      >
        {icon}
        {label}
      </button>
      <button
        onClick={onConfigure}
        disabled={disabled}
        title="Configure"
        className="flex items-center border-l border-[var(--border)] px-3 py-2 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-40"
      >
        <ChevronRightIcon />
      </button>
    </div>
  );
}

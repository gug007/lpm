import type { ReactNode } from "react";

interface HoverActionButtonProps {
  label: string;
  title?: string;
  danger?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}

// The square buttons a list row reveals on hover in place of its time.
export function HoverActionButton({ label, title, danger, disabled, onClick, children }: HoverActionButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title ?? label}
      aria-label={label}
      className={`grid h-[30px] w-[30px] shrink-0 place-items-center rounded-lg bg-[var(--bg-hover)] text-[var(--text-secondary)] transition-colors enabled:hover:bg-[var(--bg-active)] disabled:cursor-not-allowed disabled:opacity-40 ${
        danger ? "enabled:hover:text-[var(--accent-red)]" : "enabled:hover:text-[var(--text-primary)]"
      }`}
    >
      {children}
    </button>
  );
}

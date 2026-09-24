import type { ReactNode } from "react";

interface SendLaterFooterButtonProps {
  onClick: () => void;
  disabled?: boolean;
  title?: string;
  children: ReactNode;
}

export function SendLaterFooterButton({ onClick, disabled, title, children }: SendLaterFooterButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-[var(--border)] px-2 text-[11px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-40 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );
}

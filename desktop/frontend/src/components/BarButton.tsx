import type { ButtonHTMLAttributes, ReactNode } from "react";

interface BarButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon?: ReactNode;
  // The bar's main action, in the text color.
  strong?: boolean;
}

// A quiet button in a one-line bar above a project.
export function BarButton({ children, icon, strong = false, ...button }: BarButtonProps) {
  return (
    <button
      type="button"
      {...button}
      className={`flex shrink-0 items-center gap-1 rounded-md px-2 py-0.5 text-[12px] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-50 ${
        strong ? "font-medium text-[var(--text-primary)]" : "text-[var(--text-muted)]"
      }`}
    >
      {icon}
      {children}
    </button>
  );
}

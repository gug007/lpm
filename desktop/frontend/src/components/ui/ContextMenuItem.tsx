import type { ReactNode } from "react";

interface ContextMenuItemProps {
  label: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  shortcut?: string;
  onClick: () => void;
  disabled?: boolean;
  destructive?: boolean;
  title?: string;
}

export function ContextMenuItem({
  label,
  description,
  icon,
  shortcut,
  onClick,
  disabled,
  destructive,
  title,
}: ContextMenuItemProps) {
  const tone = destructive
    ? "text-[var(--accent-red)] hover:bg-[var(--bg-hover)]"
    : "text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${tone} ${description ? "items-start" : ""}`}
    >
      {icon && <span className={`flex shrink-0 items-center ${description ? "pt-0.5" : ""}`}>{icon}</span>}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate">{label}</span>
        {description && (
          <span className="text-[10px] leading-snug text-[var(--text-muted)]">{description}</span>
        )}
      </span>
      {shortcut && (
        <span className="shrink-0 text-[10px] opacity-50">{shortcut}</span>
      )}
    </button>
  );
}

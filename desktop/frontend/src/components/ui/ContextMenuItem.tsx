import type { ReactNode } from "react";

interface ContextMenuItemProps {
  label: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  shortcut?: string;
  trailing?: ReactNode;
  // A second, smaller button at the row's end with its own action, such as
  // pinning the row elsewhere. Kept out of the arrow-key order.
  trailingAction?: { label: string; icon: ReactNode; onClick: () => void };
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
  trailing,
  trailingAction,
  onClick,
  disabled,
  destructive,
  title,
}: ContextMenuItemProps) {
  const tone = destructive
    ? "text-[var(--accent-red)] hover:bg-[var(--bg-hover)] focus-visible:bg-[var(--bg-hover)]"
    : "text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] focus-visible:bg-[var(--bg-hover)] focus-visible:text-[var(--text-primary)]";
  const row = (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`flex w-full min-w-0 items-center gap-2 px-3 py-1.5 text-left text-[11px] outline-none transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${tone} ${description ? "items-start" : ""}`}
    >
      {icon && <span className={`flex shrink-0 items-center ${description ? "pt-0.5" : ""}`}>{icon}</span>}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate">{label}</span>
        {description && (
          <span className="text-[10px] leading-snug text-[var(--text-muted)]">{description}</span>
        )}
      </span>
      {shortcut && (
        <span className="shrink-0 text-[10px] text-[var(--text-muted)]">{shortcut}</span>
      )}
      {trailing && <span className="flex shrink-0 items-center text-[var(--text-muted)]">{trailing}</span>}
    </button>
  );
  if (!trailingAction) return row;
  return (
    <div className="group flex items-stretch">
      {row}
      <button
        type="button"
        data-menu-aux
        onClick={trailingAction.onClick}
        aria-label={trailingAction.label}
        title={trailingAction.label}
        className="mr-1.5 flex shrink-0 items-center rounded px-1 text-[var(--text-muted)] opacity-50 transition-opacity hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] hover:opacity-100 focus-visible:opacity-100 group-hover:opacity-100"
      >
        {trailingAction.icon}
      </button>
    </div>
  );
}

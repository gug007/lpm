import type { ReactNode } from "react";

interface ContextMenuItemProps {
  label: ReactNode;
  icon?: ReactNode;
  shortcut?: string;
  onClick: () => void;
  disabled?: boolean;
  destructive?: boolean;
  title?: string;
}

export function ContextMenuItem({
  label,
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
      className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${tone}`}
    >
      {icon && <span className="flex shrink-0 items-center">{icon}</span>}
      <span className="flex-1 truncate">{label}</span>
      {shortcut && (
        <span className="shrink-0 text-[10px] opacity-50">{shortcut}</span>
      )}
    </button>
  );
}

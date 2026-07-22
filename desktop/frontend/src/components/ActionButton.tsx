import type { MouseEvent } from "react";
import { actionButtonStyle } from "../actionColors";

const actionStyles = {
  primary:
    "bg-[var(--text-primary)] text-[var(--bg-primary)] hover:opacity-85",
  destructive:
    "bg-[var(--accent-red)] text-white hover:opacity-85",
  secondary:
    "border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--terminal-header-active)] hover:text-[var(--text-primary)]",
  ghost:
    "text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--terminal-header-active)]",
} as const;

export function ActionButton({
  onClick,
  onContextMenu,
  disabled,
  variant,
  label,
  color,
}: {
  onClick: () => void;
  onContextMenu?: (e: MouseEvent) => void;
  disabled: boolean;
  variant: keyof typeof actionStyles;
  label: string;
  color?: string;
}) {
  return (
    <button
      onClick={onClick}
      onContextMenu={onContextMenu}
      disabled={disabled}
      style={actionButtonStyle(color)}
      className={`shrink-0 cursor-grab select-none whitespace-nowrap rounded-lg px-3.5 py-1.5 text-xs font-medium transition-all duration-100 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40 ${actionStyles[variant]}`}
    >
      {label}
    </button>
  );
}

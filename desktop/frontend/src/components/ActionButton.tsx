import type { MouseEvent, ReactNode } from "react";
import { actionButtonStyle } from "../actionColors";
import { ActionRunMarkBadge } from "./ActionRunMarkBadge";

const actionStyles = {
  primary:
    "bg-[var(--text-primary)] text-[var(--bg-primary)] hover:opacity-85",
  destructive:
    "bg-[var(--accent-red)] text-white hover:opacity-85",
  secondary:
    "border border-[var(--border)] bg-[var(--action-tint,var(--bg-secondary))] text-[var(--text-secondary)] hover:bg-[var(--action-tint-strong,var(--terminal-header-active))] hover:text-[var(--text-primary)]",
  ghost:
    "text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--terminal-header-active)]",
} as const;

export function ActionButton({
  onClick,
  onContextMenu,
  onMouseEnter,
  disabled,
  variant,
  label,
  color,
  runKey,
}: {
  onClick: () => void;
  onContextMenu?: (e: MouseEvent) => void;
  onMouseEnter?: () => void;
  disabled: boolean;
  variant: keyof typeof actionStyles;
  label: ReactNode;
  color?: string;
  // Names the button to a quick action's result card and run mark.
  runKey?: string;
}) {
  return (
    <button
      onClick={onClick}
      onContextMenu={onContextMenu}
      onMouseEnter={onMouseEnter}
      disabled={disabled}
      style={actionButtonStyle(color)}
      data-action-run={runKey}
      className={`relative inline-flex h-8 shrink-0 cursor-grab select-none items-center whitespace-nowrap rounded-lg text-xs font-medium transition-all duration-100 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40 ${actionStyles[variant]}`}
    >
      {label}
      {runKey && <ActionRunMarkBadge runKey={runKey} />}
    </button>
  );
}

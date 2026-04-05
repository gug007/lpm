const actionStyles = {
  primary:
    "bg-[var(--text-primary)] text-[var(--bg-primary)] hover:opacity-85",
  destructive:
    "bg-[var(--accent-red)] text-white hover:opacity-85",
  secondary:
    "border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]",
  ghost:
    "text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]",
} as const;

export function ActionButton({
  onClick,
  disabled,
  variant,
  label,
}: {
  onClick: () => void;
  disabled: boolean;
  variant: keyof typeof actionStyles;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`shrink-0 whitespace-nowrap rounded-lg px-3.5 py-1.5 text-xs font-medium transition-all disabled:opacity-40 ${actionStyles[variant]}`}
    >
      {label}
    </button>
  );
}

export function IconBtn({ onClick, title, ariaLabel, children, active, className = "" }: {
  onClick: () => void;
  // Native tooltip; omit when the button is wrapped in the styled Tooltip
  // (which would otherwise stack a second tooltip) and pass ariaLabel instead.
  title?: string;
  ariaLabel?: string;
  children: React.ReactNode;
  active?: boolean;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={ariaLabel ?? title}
      className={`flex items-center justify-center rounded p-1 transition-colors ${
        active
          ? "bg-[var(--terminal-header-active)] text-[var(--terminal-tab-active)]"
          : "text-[var(--terminal-header-text)] hover:bg-[var(--terminal-header-hover)] hover:text-[var(--terminal-tab-active)]"
      } ${className}`}
    >
      {children}
    </button>
  );
}

import type { CSSProperties, KeyboardEvent, ReactNode } from "react";

// One choice in a status-line layout list: radio, name and hint, then the
// whole sample line under them on the terminal's own background.
export function StatusLineChoiceRow({
  active,
  disabled,
  label,
  hint,
  sample,
  sampleStyle,
  tabIndex,
  onClick,
  onKeyDown,
}: {
  active: boolean;
  disabled: boolean;
  label: string;
  hint: string;
  sample: ReactNode | null;
  sampleStyle?: CSSProperties;
  tabIndex: number;
  onClick: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      tabIndex={tabIndex}
      disabled={disabled}
      onClick={onClick}
      onKeyDown={onKeyDown}
      className={`group grid w-full grid-cols-[16px_minmax(0,1fr)] items-start gap-x-3 gap-y-2 px-4 py-3 text-left outline-none transition-colors focus-visible:bg-[var(--bg-hover)] disabled:cursor-not-allowed disabled:opacity-50 ${
        active
          ? "bg-[var(--accent-green)]/[0.07]"
          : "hover:bg-[var(--bg-hover)]"
      }`}
    >
      <span
        aria-hidden
        className={`mt-0.5 flex h-4 w-4 items-center justify-center rounded-full border transition-colors ${
          active
            ? "border-[var(--accent-green)] bg-[var(--accent-green)]"
            : "border-[var(--text-muted)]/70 group-hover:border-[var(--text-secondary)]"
        }`}
      >
        {active && <span className="h-1.5 w-1.5 rounded-full bg-[var(--bg-primary)]" />}
      </span>
      <span className="flex min-w-0 flex-wrap items-baseline gap-x-2">
        <span className="text-[13px] font-medium text-[var(--text-primary)]">{label}</span>
        <span className="text-[12px] text-[var(--text-muted)]">{hint}</span>
      </span>
      {sample !== null && (
        <span
          aria-hidden
          className="col-start-2 flex min-h-8 flex-wrap items-center gap-y-0.5 rounded-md px-2.5 py-1.5 font-mono text-[11px] leading-5"
          style={{ ...sampleStyle, background: "var(--terminal-bg)", color: "var(--terminal-fg)" }}
        >
          {sample}
        </span>
      )}
    </button>
  );
}

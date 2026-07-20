export function StatusLineStepper({
  value,
  min,
  max,
  disabled,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  disabled: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <div className="inline-flex h-9 items-center overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg-primary)]">
      <button
        type="button"
        disabled={disabled || value <= min}
        onClick={() => onChange(value - 1)}
        aria-label="Make meter narrower"
        className="flex h-9 w-9 items-center justify-center text-[var(--text-muted)] outline-none transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[var(--accent-blue)] disabled:opacity-30"
      >
        <span className="text-[15px] leading-none">−</span>
      </button>
      <span className="w-8 text-center text-[11.5px] tabular-nums text-[var(--text-primary)]">
        {value}
      </span>
      <button
        type="button"
        disabled={disabled || value >= max}
        onClick={() => onChange(value + 1)}
        aria-label="Make meter wider"
        className="flex h-9 w-9 items-center justify-center text-[var(--text-muted)] outline-none transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[var(--accent-blue)] disabled:opacity-30"
      >
        <span className="text-[15px] leading-none">+</span>
      </button>
    </div>
  );
}

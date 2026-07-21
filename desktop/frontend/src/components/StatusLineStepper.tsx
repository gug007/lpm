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
  const onValueKeyDown = (event: React.KeyboardEvent<HTMLSpanElement>) => {
    if (disabled) return;
    if (event.key === "ArrowDown" || event.key === "ArrowLeft") {
      event.preventDefault();
      if (value > min) onChange(value - 1);
    } else if (event.key === "ArrowUp" || event.key === "ArrowRight") {
      event.preventDefault();
      if (value < max) onChange(value + 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      onChange(min);
    } else if (event.key === "End") {
      event.preventDefault();
      onChange(max);
    }
  };

  return (
    <div
      className="inline-flex h-8 items-center overflow-hidden rounded-md border border-[var(--border)] bg-[var(--bg-primary)]"
      role="group"
      aria-label="Meter width controls"
    >
      <button
        type="button"
        disabled={disabled || value <= min}
        onClick={() => onChange(value - 1)}
        aria-label="Make meter narrower"
        className="flex h-8 w-8 items-center justify-center text-[var(--text-muted)] outline-none transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[var(--accent-blue)] disabled:opacity-30"
      >
        <span className="text-[15px] leading-none">−</span>
      </button>
      <span
        role="spinbutton"
        aria-label="Meter width"
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-disabled={disabled}
        tabIndex={disabled ? -1 : 0}
        onKeyDown={onValueKeyDown}
        className="flex h-8 w-7 items-center justify-center text-center text-[11px] tabular-nums text-[var(--text-primary)] outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[var(--accent-blue)]"
      >
        {value}
      </span>
      <button
        type="button"
        disabled={disabled || value >= max}
        onClick={() => onChange(value + 1)}
        aria-label="Make meter wider"
        className="flex h-8 w-8 items-center justify-center text-[var(--text-muted)] outline-none transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[var(--accent-blue)] disabled:opacity-30"
      >
        <span className="text-[15px] leading-none">+</span>
      </button>
    </div>
  );
}

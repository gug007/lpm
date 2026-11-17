const STEP_BUTTON =
  "flex h-6 w-6 items-center justify-center rounded-md text-[15px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-40";

// A value set in steps, with − and + either side of it.
export function StepperControl({
  value,
  label,
  canDecrease,
  canIncrease,
  onDecrease,
  onIncrease,
}: {
  value: string;
  /// What the buttons change, for their accessible names.
  label: string;
  canDecrease: boolean;
  canIncrease: boolean;
  onDecrease: () => void;
  onIncrease: () => void;
}) {
  return (
    <div className="flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] p-0.5">
      <button
        onClick={onDecrease}
        disabled={!canDecrease}
        className={STEP_BUTTON}
        aria-label={`Decrease ${label}`}
        title={canDecrease ? undefined : "This is the smallest"}
      >
        −
      </button>
      <span className="min-w-[1.75rem] text-center font-mono text-xs tabular-nums text-[var(--text-primary)]">
        {value}
      </span>
      <button
        onClick={onIncrease}
        disabled={!canIncrease}
        className={STEP_BUTTON}
        aria-label={`Increase ${label}`}
        title={canIncrease ? undefined : "This is the largest"}
      >
        +
      </button>
    </div>
  );
}

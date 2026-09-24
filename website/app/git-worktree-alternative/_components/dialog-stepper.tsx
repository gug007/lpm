import { MAX_COPIES, MIN_COPIES, copyNoun } from "./dialog-data";
import { INSET_FOCUS } from "./dialog-styles";

const STEP_BUTTON = `flex h-8 w-8 items-center justify-center text-lg text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] aria-disabled:opacity-30 aria-disabled:hover:bg-transparent aria-disabled:hover:text-[var(--text-secondary)] aria-disabled:cursor-default ${INSET_FOCUS}`;

export default function DialogStepper({
  count,
  onChange,
}: {
  count: number;
  onChange: (next: number) => void;
}) {
  return (
    <div className="inline-flex items-center overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)]">
      <button
        type="button"
        onClick={() => count > MIN_COPIES && onChange(count - 1)}
        aria-disabled={count <= MIN_COPIES}
        aria-label="Fewer copies"
        className={STEP_BUTTON}
      >
        −
      </button>
      <span
        aria-live="polite"
        aria-atomic="true"
        className="flex h-8 w-11 items-center justify-center border-x border-[var(--border)] text-[13px] font-semibold tabular-nums text-[var(--text-primary)]"
      >
        {count}
        <span className="sr-only"> {copyNoun(count)}</span>
      </span>
      <button
        type="button"
        onClick={() => count < MAX_COPIES && onChange(count + 1)}
        aria-disabled={count >= MAX_COPIES}
        aria-label="More copies"
        className={STEP_BUTTON}
      >
        +
      </button>
    </div>
  );
}

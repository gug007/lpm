import { RefreshIcon } from "../../icons";

interface JobRowRetryProps {
  onRetry: () => void;
  onOpen: () => void;
}

const BUTTON =
  "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent-cyan)]";

// Under a row whose last run failed: run it again, or open the run to read it.
export function JobRowRetry({ onRetry, onOpen }: JobRowRetryProps) {
  return (
    <span className="mt-2 flex items-center gap-1.5">
      <button
        type="button"
        onClick={onRetry}
        className={`${BUTTON} bg-[var(--text-primary)] text-[var(--bg-primary)] hover:opacity-90`}
      >
        <RefreshIcon />
        Retry
      </button>
      <button
        type="button"
        onClick={onOpen}
        className={`${BUTTON} border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]`}
      >
        Open run
      </button>
    </span>
  );
}

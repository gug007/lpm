import { SpinnerIcon } from "../project-detail/icons";
import { ProgressBar } from "../ui/ProgressBar";
import type { SyncProgress } from "./ignoredSyncApi";
import { progressLine } from "./syncWords";

export function IgnoredSyncProgress({
  progress,
  several,
  onCancel,
}: {
  progress: SyncProgress;
  // Syncing with more than one other computer.
  several: boolean;
  onCancel: () => void;
}) {
  const copying = progress.phase === "copying" && (progress.total ?? 0) > 0;
  const percent = copying ? Math.min(100, Math.round(((progress.sent ?? 0) / (progress.total ?? 1)) * 100)) : 0;
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 border-t border-[var(--border)] px-12 py-10">
      <div className="flex items-center gap-2 text-[13px] font-medium text-[var(--text-primary)]">
        <SpinnerIcon />
        {copying
          ? `Bringing files in step${progress.machine ? ` with ${progress.machine}` : ""}`
          : several
            ? "Comparing the computers"
            : "Comparing both computers"}
      </div>
      {copying && <ProgressBar value={percent} />}
      <p className="text-[12px] text-[var(--text-muted)]">
        {copying ? progressLine(progress) : "Files that already match are skipped."}
      </p>
      <button
        type="button"
        onClick={onCancel}
        className="mt-2 rounded-lg border border-[var(--border)] px-4 py-2 text-[13px] font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
      >
        Stop
      </button>
    </div>
  );
}

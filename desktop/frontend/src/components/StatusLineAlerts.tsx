export function StatusLineAlerts({
  loadError,
  applyError,
  presetError,
  onRetryLoad,
  onRetryPreset,
}: {
  loadError: string | null;
  applyError: string | null;
  presetError: boolean;
  onRetryLoad: () => void;
  onRetryPreset: () => void;
}) {
  return (
    <div className="min-w-0 space-y-3">
      {loadError && (
        <div
          role="alert"
          className="flex items-center gap-3 rounded-xl border border-[var(--accent-red)]/30 bg-[var(--accent-red)]/8 px-3 py-2.5 text-[10.5px] leading-relaxed text-[var(--accent-red-text)]"
        >
          <span className="min-w-0 flex-1">
            Couldn’t load your saved status line.
          </span>
          <button
            type="button"
            onClick={onRetryLoad}
            className="h-7 shrink-0 rounded-lg border border-[var(--accent-red)]/30 px-2.5 font-medium outline-none transition-colors hover:bg-[var(--accent-red)]/10 focus-visible:ring-1 focus-visible:ring-[var(--accent-red)]"
          >
            Retry
          </button>
        </div>
      )}

      {applyError && (
        <div
          role="alert"
          title={applyError}
          className="rounded-xl border border-[var(--accent-red)]/30 bg-[var(--accent-red)]/8 px-3 py-2.5 text-[10.5px] leading-relaxed text-[var(--accent-red-text)]"
        >
          Couldn’t apply this change. Your previous status line is still active.
          <details className="mt-1 select-text text-[10px] opacity-80">
            <summary className="w-fit cursor-pointer outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-red)]">
              Show details
            </summary>
            <p className="mt-1 break-words">{applyError}</p>
          </details>
        </div>
      )}

      {presetError && (
        <div
          role="alert"
          className="flex items-center gap-3 rounded-xl border border-[var(--accent-amber)]/30 bg-[var(--accent-amber)]/8 px-3 py-2.5 text-[10.5px] leading-relaxed text-[var(--accent-amber-text)]"
        >
          <span className="min-w-0 flex-1">
            Couldn’t load this preset’s customization controls.
          </span>
          <button
            type="button"
            onClick={onRetryPreset}
            className="h-7 shrink-0 rounded-lg border border-[var(--accent-amber)]/30 px-2.5 font-medium outline-none transition-colors hover:bg-[var(--accent-amber)]/10 focus-visible:ring-1 focus-visible:ring-[var(--accent-amber)]"
          >
            Retry
          </button>
        </div>
      )}
    </div>
  );
}

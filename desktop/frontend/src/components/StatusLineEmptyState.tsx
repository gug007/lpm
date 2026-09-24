import { SlidersHorizontal, Sparkles } from "lucide-react";

export function StatusLineEmptyState({
  aiEdited,
  disabled,
  onBuildCustom,
  onStartWithClean,
}: {
  aiEdited: boolean;
  disabled: boolean;
  onBuildCustom: () => void;
  onStartWithClean: () => void;
}) {
  return (
    <section className="flex flex-col items-center rounded-2xl border border-dashed border-[var(--border)] bg-[var(--bg-secondary)]/20 px-5 py-7 text-center">
      <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--accent-green)]/10 text-[var(--accent-green-text)]">
        {aiEdited ? <Sparkles size={19} /> : <SlidersHorizontal size={19} />}
      </span>
      <h2 className="text-[13px] font-semibold text-[var(--text-primary)]">
        {aiEdited ? "Your AI-edited line is active" : "Ready to make it yours?"}
      </h2>
      <p className="mt-1 max-w-sm text-[11px] leading-relaxed text-[var(--text-muted)]">
        Choose Custom to arrange each item yourself, or start with Clean and
        fine-tune it.
      </p>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        <button
          type="button"
          onClick={onBuildCustom}
          disabled={disabled}
          className="h-8 rounded-lg bg-[var(--accent-green)] px-3 text-[11px] font-semibold text-green-950 outline-none transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-[var(--accent-green)]/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-primary)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          Build a custom line
        </button>
        <button
          type="button"
          onClick={onStartWithClean}
          disabled={disabled}
          className="h-8 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 text-[11px] font-medium text-[var(--text-secondary)] outline-none transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] focus-visible:ring-1 focus-visible:ring-[var(--accent-blue)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          Start with Clean
        </button>
      </div>
    </section>
  );
}

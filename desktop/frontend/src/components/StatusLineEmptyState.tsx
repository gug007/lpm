import { Sparkles } from "lucide-react";
import { BTN_PRIMARY, BTN_SECONDARY } from "./ui/buttons";
import { CARD_CLASS } from "./ui/fields";

// Shown while an AI-edited line is active: it has no row in the layout list,
// so this says what's running and how to take it over.
export function StatusLineEmptyState({
  disabled,
  onBuildCustom,
  onStartWithClean,
}: {
  disabled: boolean;
  onBuildCustom: () => void;
  onStartWithClean: () => void;
}) {
  return (
    <section className={`${CARD_CLASS} flex flex-wrap items-center gap-3 px-4 py-3.5`}>
      <Sparkles aria-hidden size={16} className="shrink-0 text-[var(--text-secondary)]" />
      <div className="min-w-0 flex-1">
        <h2 className="text-[13px] font-semibold text-[var(--text-primary)]">
          Your AI-edited line is active
        </h2>
        <p className="mt-0.5 text-[12px] text-[var(--text-muted)]">
          Pick a layout above to replace it, or rebuild it item by item.
        </p>
      </div>
      <div className="flex shrink-0 gap-2">
        <button type="button" onClick={onStartWithClean} disabled={disabled} className={BTN_SECONDARY}>
          Start with Clean
        </button>
        <button
          type="button"
          onClick={onBuildCustom}
          disabled={disabled}
          className={BTN_PRIMARY}
        >
          Build a custom line
        </button>
      </div>
    </section>
  );
}

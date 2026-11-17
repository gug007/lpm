import type { FeedbackKind } from "./feedbackDraft";

export interface FeedbackKindChoice {
  value: FeedbackKind;
  title: string;
  hint: string;
}

export function FeedbackKindPicker({
  choices,
  value,
  guessed,
  onPick,
}: {
  choices: readonly FeedbackKindChoice[];
  value: FeedbackKind | null;
  guessed: boolean;
  onPick: (kind: FeedbackKind) => void;
}) {
  return (
    <div className="mt-4 flex items-start gap-3">
      <span className="pt-1.5 text-[12px] font-medium text-[var(--text-secondary)]">Type</span>
      <div>
        <div
          role="group"
          aria-label="Feedback type"
          className="inline-flex rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)]/60 p-0.5"
        >
          {choices.map((choice) => {
            const selected = value === choice.value;
            return (
              <button
                key={choice.value}
                type="button"
                onClick={() => onPick(choice.value)}
                aria-pressed={selected}
                title={choice.hint}
                className={`h-7 rounded-md px-3.5 text-[12px] font-medium transition-colors ${
                  selected
                    ? "bg-[var(--bg-active)] text-[var(--text-primary)] shadow-[0_1px_2px_rgba(0,0,0,0.18)]"
                    : "text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                }`}
              >
                {choice.title}
              </button>
            );
          })}
        </div>
        <p className="mt-1.5 text-[12px] text-[var(--text-muted)]">
          {value === null
            ? "Picked for you from what you write."
            : guessed
              ? "Guessed from your text. Pick another to change it."
              : "Picked by you."}
        </p>
      </div>
    </div>
  );
}

import { MockModalShell } from "./ActionDemo";
import { previewValue, type InputDraft } from "./actionInputs";

// The run dialog, miniaturized inside the wizard's preview frame. The choices
// are live: picking one updates the answer the demo terminal then runs with, so
// the whole substitution is visible without saving anything.
export function QuestionsDemo({
  label,
  inputs,
  answers,
  submitLabel,
  onAnswer,
  onCancel,
  onSubmit,
}: {
  label: string;
  inputs: InputDraft[];
  answers: Record<string, string>;
  submitLabel: string;
  onAnswer: (key: string, value: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  const shown = inputs.slice(0, 3);
  return (
    <MockModalShell width={150}>
      <div className="space-y-1 px-2 py-1.5">
        <div className="truncate text-[8px] font-medium text-[var(--text-primary)]">
          {label}
        </div>
        {shown.map((input) => (
          <div key={input.id} className="space-y-[2px]">
            <div className="truncate text-[6px] text-[var(--text-muted)]">
              {input.label.trim() || input.key}
              {input.required && <span className="text-[var(--accent-red)]">*</span>}
            </div>
            {input.type === "radio" ? (
              <div className="space-y-[2px]">
                {input.options
                  .filter((option) => option.value.trim())
                  .slice(0, 3)
                  .map((option) => {
                    const selected = answers[input.key] === option.value;
                    return (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => onAnswer(input.key, option.value)}
                        className="flex w-full items-center gap-1 rounded px-[2px] py-[1px] text-left hover:bg-[var(--bg-hover)]"
                      >
                        <span
                          className={`flex h-[5px] w-[5px] shrink-0 items-center justify-center rounded-full border ${
                            selected
                              ? "border-[var(--accent-blue)]"
                              : "border-[var(--text-muted)]"
                          }`}
                        >
                          {selected && (
                            <span className="h-[2px] w-[2px] rounded-full bg-[var(--accent-blue)]" />
                          )}
                        </span>
                        <span
                          className={`truncate text-[6px] ${
                            selected
                              ? "text-[var(--text-primary)]"
                              : "text-[var(--text-secondary)]"
                          }`}
                        >
                          {option.label.trim() || option.value}
                        </span>
                      </button>
                    );
                  })}
              </div>
            ) : (
              <div className="truncate rounded border border-[var(--border)] px-1 py-[1px] font-mono text-[6px] text-[var(--text-secondary)]">
                {answers[input.key]?.trim() || previewValue(input)}
              </div>
            )}
          </div>
        ))}
        {inputs.length > shown.length && (
          <div className="text-[6px] text-[var(--text-muted)]">
            +{inputs.length - shown.length} more
          </div>
        )}
      </div>
      <div className="flex justify-end gap-1 border-t border-[var(--border)] px-1.5 py-1">
        <button
          type="button"
          onClick={onCancel}
          className="rounded px-1.5 py-[1px] text-[7px] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onSubmit}
          className="rounded bg-[var(--text-primary)] px-1.5 py-[1px] text-[7px] font-medium text-[var(--bg-primary)]"
        >
          {submitLabel}
        </button>
      </div>
    </MockModalShell>
  );
}

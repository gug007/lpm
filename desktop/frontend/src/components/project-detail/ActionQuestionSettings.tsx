import { Switch } from "../ui/Switch";
import { PlusIcon, TrashIcon } from "../icons";
import { newOptionDraft, type InputDraft } from "./actionInputs";
import { FIELD_CLASS } from "./actionInputsStyles";

// The per-question settings behind "More": everything a first-time user
// shouldn't have to see to add a question, but needs once they mean it.
export function QuestionSettings({
  input,
  problem,
  onPatch,
}: {
  input: InputDraft;
  problem: string | null;
  onPatch: (patch: Partial<InputDraft>) => void;
}) {
  const choices = input.type === "radio";

  const setOption = (id: string, patch: { label?: string; value?: string }) =>
    onPatch({
      options: input.options.map((option) =>
        option.id === id ? { ...option, ...patch } : option,
      ),
    });

  return (
    <div className="space-y-2.5 pb-1">
      {choices ? (
        <div className="space-y-1.5">
          <SettingLabel>Choices</SettingLabel>
          {input.options.map((option, index) => (
            <div key={option.id} className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full border border-[var(--text-muted)]" />
              <input
                value={option.value}
                onChange={(e) => setOption(option.id, { value: e.target.value })}
                placeholder={`Choice ${index + 1}`}
                className={FIELD_CLASS}
              />
              <input
                value={option.label}
                onChange={(e) =>
                  setOption(option.id, { label: e.target.value })
                }
                placeholder="Shown as (optional)"
                className={FIELD_CLASS}
              />
              <button
                type="button"
                onClick={() =>
                  onPatch({
                    options: input.options.filter((o) => o.id !== option.id),
                  })
                }
                disabled={input.options.length === 1}
                aria-label="Remove choice"
                className="shrink-0 rounded-lg p-1.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-30"
              >
                <TrashIcon />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() =>
              onPatch({ options: [...input.options, newOptionDraft()] })
            }
            className="flex items-center gap-1.5 rounded-lg px-1 py-1 text-[11px] font-medium text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
          >
            <PlusIcon /> Add choice
          </button>
        </div>
      ) : (
        <div className="space-y-1.5">
          <SettingLabel>Hint shown in the box</SettingLabel>
          <input
            value={input.placeholder}
            onChange={(e) => onPatch({ placeholder: e.target.value })}
            placeholder="v1.0.0"
            className={FIELD_CLASS}
          />
        </div>
      )}

      <div className="space-y-1.5">
        <SettingLabel>Starts as</SettingLabel>
        {choices ? (
          <select
            value={input.default}
            onChange={(e) => onPatch({ default: e.target.value })}
            className={FIELD_CLASS}
          >
            <option value="">Nothing selected</option>
            {input.options
              .filter((option) => option.value.trim())
              .map((option) => (
                <option key={option.id} value={option.value}>
                  {option.label.trim() || option.value}
                </option>
              ))}
          </select>
        ) : (
          <input
            value={input.default}
            onChange={(e) => onPatch({ default: e.target.value })}
            placeholder="Empty"
            className={FIELD_CLASS}
          />
        )}
      </div>

      {problem && (
        <div className="text-[11px] text-[var(--accent-red)]">{problem}</div>
      )}

      <ToggleRow
        checked={input.required}
        label="Required"
        hint="Can't run without an answer."
        onChange={(value) => onPatch({ required: value })}
      />
      {input.type !== "password" && (
        <ToggleRow
          checked={input.persist}
          label="Remember the last answer"
          hint="Starts on whatever was used last time."
          onChange={(value) => onPatch({ persist: value })}
        />
      )}
    </div>
  );
}

function SettingLabel({ children }: { children: string }) {
  return (
    <div className="text-[11px] font-medium text-[var(--text-secondary)]">
      {children}
    </div>
  );
}

function ToggleRow({
  checked,
  label,
  hint,
  onChange,
}: {
  checked: boolean;
  label: string;
  hint: string;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center gap-3 rounded-md px-1 py-1 text-left transition-colors hover:bg-[var(--bg-hover)]"
    >
      <Switch checked={checked} />
      <span className="min-w-0 flex-1">
        <span className="block text-[12px] text-[var(--text-primary)]">
          {label}
        </span>
        <span className="block text-[11px] text-[var(--text-muted)]">
          {hint}
        </span>
      </span>
    </button>
  );
}

import { useState, useRef, useEffect } from "react";
import { Modal } from "../ui/Modal";
import type { ActionInfo } from "../../types";

interface ActionInputsModalProps {
  action: ActionInfo;
  onCancel: () => void;
  onSubmit: (values: Record<string, string>) => void;
}

export function ActionInputsModal({ action, onCancel, onSubmit }: ActionInputsModalProps) {
  const inputs = action.inputs ?? [];
  const [values, setValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const inp of inputs) {
      init[inp.key] = inp.default || "";
    }
    return init;
  });

  const firstRef = useRef<HTMLInputElement>(null);
  useEffect(() => { firstRef.current?.focus(); }, []);

  const canSubmit = inputs.every((inp) => !inp.required || values[inp.key]?.trim());

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (canSubmit) onSubmit(values);
  };

  const set = (key: string, value: string) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  return (
    <Modal
      open
      onClose={onCancel}
      zIndexClassName="z-[60]"
      contentClassName="w-96 rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] shadow-xl"
    >
      <form onSubmit={handleSubmit}>
        <div className="px-5 pt-5 pb-1">
          <h3 className="text-base font-semibold text-[var(--text-primary)]">{action.label}</h3>
        </div>
        <div className="flex flex-col gap-4 px-5 py-4">
          {inputs.map((inp, i) => (
            <label key={inp.key} className="flex flex-col gap-1.5">
              <span className="text-[11px] text-[var(--text-secondary)]">
                {inp.label}
                {inp.required && <span className="ml-0.5 text-[var(--accent-red)]">*</span>}
              </span>
              {inp.type === "radio" && inp.options?.length ? (
                <div className="flex flex-col gap-1">
                  {inp.options.map((opt) => {
                    const selected = values[inp.key] === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => set(inp.key, opt.value)}
                        className="flex items-center gap-2.5 rounded-md px-1 py-1.5 text-left transition-colors hover:bg-[var(--bg-hover)]"
                      >
                        <span
                          className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                            selected
                              ? "border-[var(--accent-blue)] bg-transparent"
                              : "border-[var(--text-muted)]"
                          }`}
                        >
                          {selected && (
                            <span className="h-2 w-2 rounded-full bg-[var(--accent-blue)]" />
                          )}
                        </span>
                        <span className={`text-[13px] ${selected ? "text-[var(--text-primary)]" : "text-[var(--text-secondary)]"}`}>
                          {opt.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <input
                  ref={i === 0 ? firstRef : undefined}
                  type={inp.type === "password" ? "password" : "text"}
                  value={values[inp.key] ?? ""}
                  onChange={(e) => set(inp.key, e.target.value)}
                  placeholder={inp.placeholder}
                  className="w-full rounded-md border border-[var(--border)] bg-transparent px-2.5 py-1.5 font-mono text-[13px] text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-muted)] focus:border-[var(--text-secondary)]"
                />
              )}
            </label>
          ))}
        </div>
        <div className="flex justify-end gap-2 border-t border-[var(--border)] px-5 py-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)]"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!canSubmit}
            className="rounded-lg bg-[var(--text-primary)] px-4 py-2 text-sm font-medium text-[var(--bg-primary)] transition-all hover:opacity-90 disabled:opacity-40"
          >
            Run
          </button>
        </div>
      </form>
    </Modal>
  );
}

import { AlertCircleIcon, CodeIcon } from "../icons";
import { BTN_PRIMARY } from "../ui/buttons";

export function ConfigFormUnavailable({ error, onEditYaml }: { error: string; onEditYaml: () => void }) {
  return (
    <div
      role="alert"
      className="mx-auto mt-6 flex w-full max-w-xl flex-col items-center gap-4 rounded-xl border border-[var(--accent-red)]/30 bg-[var(--accent-red)]/5 p-6 text-center"
    >
      <div className="text-[var(--accent-red)]">
        <AlertCircleIcon />
      </div>
      <div>
        <p className="text-sm font-medium text-[var(--text-primary)]">Form view is unavailable</p>
        <p className="mt-1 text-xs text-[var(--text-secondary)]">
          Fix the invalid YAML in source view, then return to the form.
        </p>
      </div>
      <pre className="max-h-40 w-full overflow-auto whitespace-pre-wrap break-words rounded-lg bg-[var(--bg-primary)] p-3 text-left text-[12px] leading-relaxed text-[var(--accent-red-text)]">
        {error}
      </pre>
      <button
        type="button"
        onClick={onEditYaml}
        className={`${BTN_PRIMARY} flex items-center gap-2`}
      >
        <CodeIcon />
        Edit YAML source
      </button>
    </div>
  );
}

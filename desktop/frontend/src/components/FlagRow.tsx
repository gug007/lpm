import { CheckIcon } from "./icons";

export function FlagRow({
  label,
  flag,
  checked,
  onToggle,
  disabled = false,
}: {
  label: string;
  flag: string;
  checked: boolean;
  onToggle: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onToggle}
      disabled={disabled}
      className="mx-1.5 flex w-[calc(100%-12px)] items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-40"
    >
      <span
        className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border ${
          checked
            ? "border-[var(--accent-green)] bg-[var(--accent-green)] text-white"
            : "border-[var(--border)]"
        }`}
      >
        {checked && <CheckIcon />}
      </span>
      <span className={checked ? "text-[var(--text-primary)]" : ""}>
        {label}
      </span>
      <span className="ml-auto font-mono text-[11px] text-[var(--text-muted)]">
        {flag}
      </span>
    </button>
  );
}

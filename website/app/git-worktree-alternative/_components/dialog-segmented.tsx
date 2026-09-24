export default function DialogSegmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (next: T) => void;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="flex w-full rounded-md border border-[var(--border)] p-0.5"
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            aria-pressed={active}
            className={`min-w-0 flex-auto truncate rounded-md px-1.5 py-1 text-[11px] font-medium transition-colors sm:flex-1 sm:px-2 sm:text-[12px] ${
              active
                ? "bg-[var(--bg-active)] text-[var(--text-primary)] forced-color-adjust-none forced-colors:bg-[Highlight] forced-colors:text-[HighlightText]"
                : "text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)]"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

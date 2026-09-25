export default function StatsSegmented<T extends string | number>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (next: T) => void;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="inline-flex shrink-0 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] p-0.5"
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={`h-7 whitespace-nowrap rounded-md px-2.5 text-[12px] font-medium transition-colors duration-[120ms] ${
              active
                ? "bg-[var(--bg-active)] text-[var(--text-primary)] forced-color-adjust-none forced-colors:bg-[Highlight] forced-colors:text-[HighlightText]"
                : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

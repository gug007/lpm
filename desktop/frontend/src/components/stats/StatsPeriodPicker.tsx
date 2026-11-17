const PERIODS = [
  { days: 1, label: "Today" },
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
  { days: 0, label: "All time" },
] as const;

interface StatsPeriodPickerProps {
  days: number;
  onChange: (days: number) => void;
}

export function StatsPeriodPicker({ days, onChange }: StatsPeriodPickerProps) {
  return (
    <div
      role="group"
      aria-label="Period"
      className="flex h-8 items-center rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-0.5"
    >
      {PERIODS.map((period) => (
        <button
          key={period.days}
          type="button"
          aria-pressed={days === period.days}
          onClick={() => period.days !== days && onChange(period.days)}
          className={`h-full rounded-md px-3 text-xs font-medium transition-colors duration-[120ms] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-blue)] ${
            days === period.days
              ? "bg-[var(--bg-active)] text-[var(--text-primary)]"
              : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          }`}
        >
          {period.label}
        </button>
      ))}
    </div>
  );
}

import { WEEKDAYS, type Weekday } from "../../../jobsFormat";

const DAY_LABEL: Record<Weekday, string> = {
  mon: "Mon",
  tue: "Tue",
  wed: "Wed",
  thu: "Thu",
  fri: "Fri",
  sat: "Sat",
  sun: "Sun",
};

interface WeekdayPickerProps {
  // Empty means every day.
  value: Weekday[];
  onChange: (days: Weekday[]) => void;
}

export function WeekdayPicker({ value, onChange }: WeekdayPickerProps) {
  const everyDay = value.length === 0;

  const toggle = (day: Weekday) => {
    const next = value.includes(day)
      ? value.filter((d) => d !== day)
      : [...value, day];
    onChange(WEEKDAYS.filter((d) => next.includes(d)));
  };

  return (
    <div className="flex flex-wrap gap-1.5">
      {WEEKDAYS.map((day) => {
        const on = !everyDay && value.includes(day);
        return (
          <button
            key={day}
            type="button"
            onClick={() => toggle(day)}
            aria-pressed={on}
            className={`rounded-lg px-2.5 py-1.5 text-[12px] font-medium transition-colors ${
              on
                ? "bg-[var(--accent-cyan)]/15 text-[var(--accent-cyan)] ring-1 ring-inset ring-[var(--accent-cyan)]/30"
                : "bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
            }`}
          >
            {DAY_LABEL[day]}
          </button>
        );
      })}
    </div>
  );
}

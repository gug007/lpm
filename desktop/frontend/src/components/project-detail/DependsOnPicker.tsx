interface DependsOnPickerProps {
  options: string[];
  value: string[];
  onChange: (next: string[]) => void;
}

export function DependsOnPicker({ options, value, onChange }: DependsOnPickerProps) {
  const selected = new Set(value);
  const toggle = (name: string) => {
    if (selected.has(name)) {
      onChange(value.filter((n) => n !== name));
    } else {
      onChange([...value, name]);
    }
  };

  if (options.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-[var(--border)] px-4 py-3 text-[12px] text-[var(--text-muted)]">
        Add another service first to depend on it.
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {options.map((name) => {
        const on = selected.has(name);
        return (
          <button
            key={name}
            type="button"
            aria-pressed={on}
            onClick={() => toggle(name)}
            className={
              "rounded-lg border px-3 py-1.5 text-[13px] font-medium transition-colors " +
              (on
                ? "border-[var(--text-primary)] bg-[var(--text-primary)] text-[var(--bg-primary)]"
                : "border-[var(--border)] bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:border-[var(--text-primary)] hover:text-[var(--text-primary)]")
            }
          >
            {name}
          </button>
        );
      })}
    </div>
  );
}

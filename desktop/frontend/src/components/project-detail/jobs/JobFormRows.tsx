// The job editor's form furniture: a section heading, the grouped card its rows
// sit in, and the label/control row itself. Shared by the editor modal and the
// cards it is assembled from, so every section lines up the same way.

export function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2 px-1 text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--text-muted)]">
      {children}
    </div>
  );
}

export function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="divide-y divide-[var(--border)]/70 overflow-hidden rounded-xl bg-[var(--bg-secondary)]/40">
      {children}
    </div>
  );
}

export function Row({
  label,
  alignTop,
  children,
}: {
  label: string;
  alignTop?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`flex ${alignTop ? "items-start" : "items-center"} justify-between gap-4 px-4 py-2.5`}
    >
      <span className="shrink-0 text-[13px] text-[var(--text-secondary)]">
        {label}
      </span>
      {children}
    </div>
  );
}

// The quiet right-aligned number field the rows use for counts and lengths.
export function RowNumber({
  value,
  min,
  max,
  onChange,
  width = "w-12",
}: {
  value: number;
  min: number;
  max?: number;
  onChange: (value: number) => void;
  width?: string;
}) {
  return (
    <input
      type="number"
      min={min}
      max={max}
      value={value}
      onChange={(e) => {
        const n = Math.floor(Number(e.target.value) || min);
        onChange(Math.min(max ?? Number.MAX_SAFE_INTEGER, Math.max(min, n)));
      }}
      className={`${width} border-none bg-transparent text-right text-[13px] text-[var(--text-secondary)] outline-none transition-colors hover:text-[var(--text-primary)] focus:text-[var(--text-primary)]`}
    />
  );
}

// The labelled lines of an agent's request in the approval dialog: where a copy
// goes from and to, or what a command runs and where.
export function AgentRequestRows({ rows }: { rows: [label: string, value: string][] }) {
  return (
    <div className="mt-4 space-y-1.5 rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] px-4 py-3">
      {rows.map(([label, value]) => (
        <div key={label} className="flex gap-3 text-[12px]">
          <span className="w-9 shrink-0 text-[var(--text-muted)]">{label}</span>
          <span className="min-w-0 whitespace-pre-wrap break-all font-mono text-[var(--text-primary)]">{value}</span>
        </div>
      ))}
    </div>
  );
}

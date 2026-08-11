import type { AgentCapability, CapabilityKind } from "../../toolkit";
import { KIND_ORDER, KIND_SHORT, needsAttention } from "../../toolkit";

interface ToolkitKindChipsProps {
  items: AgentCapability[];
  value: CapabilityKind | null;
  onChange: (kind: CapabilityKind | null) => void;
}

function Chip({
  label,
  count,
  active,
  warn,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  warn?: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex shrink-0 items-baseline gap-1 rounded-md px-1.5 py-0.5 text-[11px] transition-colors ${
        active
          ? "bg-[var(--bg-active)] text-[var(--text-primary)]"
          : "text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
      }`}
    >
      <span>{label}</span>
      <span className="tabular-nums text-[var(--text-muted)]">{count}</span>
      {warn ? <span className="tabular-nums text-[var(--accent-amber-text)]">!{warn}</span> : null}
    </button>
  );
}

// A horizontal filter row instead of a fixed side rail: the pane is often one
// half of a split, and 200px of chrome there costs more than it gives.
export function ToolkitKindChips({ items, value, onChange }: ToolkitKindChipsProps) {
  return (
    <div className="flex gap-0.5 overflow-x-auto border-b border-[var(--border)] px-2 py-1">
      <Chip
        label="All"
        count={items.length}
        warn={items.filter(needsAttention).length}
        active={value === null}
        onClick={() => onChange(null)}
      />
      {KIND_ORDER.map((kind) => {
        const group = items.filter((i) => i.kind === kind);
        if (group.length === 0) return null;
        return (
          <Chip
            key={kind}
            label={KIND_SHORT[kind]}
            count={group.length}
            warn={group.filter(needsAttention).length}
            active={value === kind}
            onClick={() => onChange(value === kind ? null : kind)}
          />
        );
      })}
    </div>
  );
}

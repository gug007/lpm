import type { AgentCapability, CapabilityKind } from "../../toolkit";
import { KIND_LABELS, formatTokens, groupByKind, isBroken } from "../../toolkit";
import { ToolkitRow } from "./ToolkitRow";

function SectionHeader({
  label,
  count,
  bytes,
  tone,
}: {
  label: string;
  count: number;
  bytes: number;
  tone?: "warn";
}) {
  return (
    <div className="sticky top-0 z-10 flex items-baseline gap-2 bg-[var(--bg-primary)] px-3 pb-1 pt-3">
      <span
        className={`text-[10px] font-medium uppercase tracking-wider ${
          tone === "warn" ? "text-[var(--accent-amber)]" : "text-[var(--text-muted)]"
        }`}
      >
        {label}
      </span>
      <span className="h-px flex-1 bg-[var(--border)]" />
      <span className="text-[10px] tabular-nums text-[var(--text-muted)]">
        {count}
        {bytes > 0 ? ` · ~${formatTokens(bytes)}` : ""}
      </span>
    </div>
  );
}

interface ToolkitListProps {
  items: AgentCapability[];
  activeIndex: number;
  onHover: (index: number) => void;
  onActivate: (cap: AgentCapability) => void;
}

// `items` arrives in display order (see `orderForDisplay`), so the flat index
// the keyboard walks and the rendered order cannot drift apart.
export function ToolkitList({ items, activeIndex, onHover, onActivate }: ToolkitListProps) {
  const broken = items.filter(isBroken);
  const healthy = items.filter((i) => !isBroken(i));
  let index = -1;

  const renderRow = (cap: AgentCapability) => {
    index += 1;
    const at = index;
    return (
      <ToolkitRow
        key={cap.id}
        cap={cap}
        active={at === activeIndex}
        onSelect={() => onHover(at)}
        onActivate={() => onActivate(cap)}
      />
    );
  };

  return (
    <div className="min-h-0 flex-1 overflow-y-auto pb-4">
      {broken.length > 0 && (
        <>
          <SectionHeader label="Needs attention" count={broken.length} bytes={0} tone="warn" />
          {broken.map(renderRow)}
        </>
      )}
      {groupByKind(healthy).map((group) => (
        <div key={group.kind}>
          <SectionHeader
            label={KIND_LABELS[group.kind as CapabilityKind]}
            count={group.items.length}
            bytes={group.bytes}
          />
          {group.items.map(renderRow)}
        </div>
      ))}
    </div>
  );
}

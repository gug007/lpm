import { ArrowDown, ArrowUp } from "lucide-react";
import { formatPercent } from "../../agentUsageFormat";
import { StatusChip } from "../ui/StatusChip";

interface ChangeValueProps {
  // Against the period before: a fraction, "new" when it had none, null when unknown.
  change: number | "new" | null;
  title?: string;
}

// More or fewer tokens is neither good nor bad, so both directions read in the
// same quiet grey and only the arrow says which way.
export function ChangeValue({ change, title }: ChangeValueProps) {
  if (change === null) return <span className="text-[var(--text-muted)]">—</span>;
  if (change === "new") {
    return (
      <span title={title}>
        <StatusChip>new</StatusChip>
      </span>
    );
  }
  if (Math.abs(change) < 0.005) {
    return (
      <span title={title} className="tabular-nums text-[var(--text-muted)]">
        0%
      </span>
    );
  }
  const Arrow = change > 0 ? ArrowUp : ArrowDown;
  return (
    <span
      title={title}
      className="inline-flex items-center gap-0.5 tabular-nums text-[var(--text-secondary)]"
    >
      <Arrow size={11} strokeWidth={2.4} className="shrink-0" />
      {formatPercent(Math.abs(change))}
    </span>
  );
}

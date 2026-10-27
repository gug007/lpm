import { TriangleAlert } from "lucide-react";
import { formatBytes } from "../../syncApi";
import type { Totals } from "./ignoredTree";

// Dependencies or build output in the choice: big, and usually better rebuilt.
export function IgnoredSyncHeavyNote({ totals }: { totals: Totals }) {
  if (!totals.heavy.length) return null;
  return (
    <div className="mx-6 mt-2.5 flex items-start gap-2.5 rounded-[10px] border border-[var(--accent-amber)]/30 bg-[var(--accent-amber)]/8 px-3 py-2.5 text-[12px] leading-snug text-[var(--accent-amber-text)]">
      <TriangleAlert size={15} className="mt-px shrink-0" />
      <span>
        {totals.heavy.join(", ")} is {formatBytes(totals.heavyBytes)}. Installing or rebuilding on each computer is
        usually faster than syncing it, and packages built on one computer can break on another chip or system.
      </span>
    </div>
  );
}

import { GitMerge } from "lucide-react";
import { useMergedCopies } from "../store/mergedCopies";

// The end of a copy's row once its pull request has merged.
export function SidebarMergedMark({ root }: { root: string }) {
  const copy = useMergedCopies((s) => s.entries[root]);
  if (!copy) return null;
  return (
    <span
      className="ml-auto flex shrink-0 items-center gap-1 pl-2 text-[10px] font-medium text-[var(--accent-purple-text)]"
      title={`Pull request #${copy.number} is merged: ${copy.title}`}
    >
      <GitMerge size={11} />
      Merged
    </span>
  );
}

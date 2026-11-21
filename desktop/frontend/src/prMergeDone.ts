import { readMergedCopy } from "./mergedCopies";
import { toast } from "./notifications/toast";
import { mergedText } from "./prMerge";
import { useAppStore } from "./store/app";
import { useBranchPr } from "./store/branchPr";
import { useMergedCopies } from "./store/mergedCopies";
import { useSettingsStore } from "./store/settings";

// After a merge from the PR card, or a wait that ended in one: say so and turn
// the footer pill to merged without waiting for the lookup the merge's
// git-changed brings. A copy the sidebar watches gets its offer to remove it
// now rather than at the next sweep.
export async function afterMerge(projectPath: string, number: number, deletedBranch: boolean): Promise<void> {
  const branch = useBranchPr.getState().entries[projectPath]?.branch ?? "";
  toast.success(`Merged #${number}`, { description: mergedText(branch, deletedBranch) });
  useBranchPr.getState().markMerged(projectPath);
  const copy = useAppStore.getState().projects.find((p) => p.root === projectPath);
  if (!copy?.parentName || !(useSettingsStore.getState().checkOrigin ?? true)) return;
  useMergedCopies.getState().setEntry(projectPath, await readMergedCopy(projectPath));
}

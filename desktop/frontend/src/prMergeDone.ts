import { readMergedCopy } from "./mergedCopies";
import { toast } from "./notifications/toast";
import { mergedText } from "./prMerge";
import { useAppStore } from "./store/app";
import { useBranchPr } from "./store/branchPr";
import { useMergedCopies } from "./store/mergedCopies";
import { useSettingsStore } from "./store/settings";

// After the PR card merges: say so and turn the footer pill to merged without
// waiting for the lookup the merge's git-changed brings. A copy the sidebar
// watches gets its offer to remove it now rather than at the next sweep.
export async function afterMerge(
  projectName: string,
  projectPath: string,
  branch: string,
  number: number,
  deletedBranch: boolean,
): Promise<void> {
  toast.success(`Merged #${number}`, { description: mergedText(branch, deletedBranch) });
  useBranchPr.getState().markMerged(projectPath);
  const copy = useAppStore.getState().projects.find((p) => p.name === projectName);
  if (!copy?.parentName || !(useSettingsStore.getState().checkOrigin ?? true)) return;
  useMergedCopies.getState().setEntry(projectPath, await readMergedCopy(projectPath));
}

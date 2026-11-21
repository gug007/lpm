import { useEffect } from "react";
import { PullRequestMergeWatch } from "../../bridge/commands";
import { usePrMergeWatch } from "../store/prMergeWatch";
import type { PrMergeWatch } from "../types";

// The wait to merge armed for `projectPath`, asked for when the card opens so a
// reload, or a connected computer's wait, shows too; events keep it current.
export function useArmedMerge(projectPath: string): PrMergeWatch | undefined {
  const watch = usePrMergeWatch((s) => s.watches[projectPath]);
  useEffect(() => {
    let live = true;
    PullRequestMergeWatch(projectPath)
      .then((found) => {
        if (!live) return;
        if (found) usePrMergeWatch.getState().apply({ ...found, path: projectPath });
        else usePrMergeWatch.getState().forget(projectPath);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [projectPath]);
  return watch;
}

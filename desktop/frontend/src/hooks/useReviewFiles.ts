import { useCallback, useEffect, useRef, useState } from "react";
import { main } from "../../bridge/models";
import { REVIEW_SOURCES, type ReviewMode } from "../components/review/reviewSource";
import { useEventListener } from "./useEventListener";
import { useGitChanged } from "./useGitChanged";

type ChangedFile = main.ChangedFile;

function sameFiles(a: ChangedFile[], b: ChangedFile[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (
      a[i].path !== b[i].path ||
      a[i].status !== b[i].status ||
      a[i].staged !== b[i].staged
    ) {
      return false;
    }
  }
  return true;
}

export function useReviewFiles(
  projectPath: string,
  mode: ReviewMode,
  baseBranch: string,
  active = true,
) {
  const [files, setFiles] = useState<ChangedFile[]>([]);
  const activeRef = useRef(active);
  activeRef.current = active;

  const refresh = useCallback(async () => {
    if (!projectPath || !activeRef.current) return;
    try {
      const f = await REVIEW_SOURCES[mode].listChanged(projectPath, baseBranch);
      const next = Array.isArray(f) ? f : [];
      // Keep the same array reference when the list is unchanged so a noisy
      // git-changed burst doesn't rebuild the tree or re-run dependents.
      setFiles((prev) => (sameFiles(prev, next) ? prev : next));
    } catch {
      setFiles((prev) => (prev.length === 0 ? prev : []));
    }
  }, [projectPath, mode, baseBranch]);

  // Fetch on mount, on source change, and when the tab becomes active again
  // (refresh no-ops while hidden, so a hidden tab does no git work).
  useEffect(() => {
    if (active) refresh();
  }, [active, refresh]);

  useEventListener("focus", refresh);
  useGitChanged(projectPath, refresh);

  return { files, refresh };
}

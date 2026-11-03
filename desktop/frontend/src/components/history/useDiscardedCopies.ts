import { useCallback, useEffect, useRef, useState } from "react";
import { GitDiscarded } from "../../../bridge/commands";
import type { DiscardedCopy } from "../../gitDiscardUndo";
import { useGitChanged } from "../../hooks/useGitChanged";

/** The discards this worktree still keeps, newest first; empty where the
 *  machine's lpm predates them. */
export function useDiscardedCopies(projectPath: string) {
  const [copies, setCopies] = useState<DiscardedCopy[]>([]);
  const seq = useRef(0);

  const reload = useCallback(async () => {
    const mine = ++seq.current;
    try {
      const list = ((await GitDiscarded(projectPath)) ?? []) as DiscardedCopy[];
      if (mine === seq.current) setCopies(list);
    } catch {
      if (mine === seq.current) setCopies([]);
    }
  }, [projectPath]);

  useEffect(() => {
    void reload();
  }, [reload]);
  useGitChanged(projectPath, () => void reload());

  return { copies, reload };
}

import { useCallback, useEffect, useState } from "react";
import { GitStatus as ApiGitStatus, ListBranches } from "../../bridge/commands";
import { EventsOn } from "../../bridge/runtime";
import { main } from "../../bridge/models";
import { GIT_CHANGED_EVENT } from "../types";
import { useEventListener } from "./useEventListener";

type GitStatus = main.GitStatus;
type Branch = main.Branch;

export function useGitStatus(projectPath: string) {
  const [status, setStatus] = useState<GitStatus | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);

  const refresh = useCallback(async () => {
    if (!projectPath) return;
    try {
      const [s, b] = await Promise.all([
        ApiGitStatus(projectPath),
        ListBranches(projectPath).catch(() => [] as Branch[]),
      ]);
      setStatus(s);
      setBranches(b);
    } catch {
      // Swallow: the caller typically hides itself when status.isGitRepo is false.
    }
  }, [projectPath]);

  useEffect(() => { refresh(); }, [refresh]);

  useEventListener("focus", refresh);

  useEffect(() => {
    const cancel = EventsOn(GIT_CHANGED_EVENT, (path: string) => {
      if (path === projectPath) refresh();
    });
    return () => {
      if (typeof cancel === "function") cancel();
    };
  }, [projectPath, refresh]);

  return { status, branches, refresh };
}

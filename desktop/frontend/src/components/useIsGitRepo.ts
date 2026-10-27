import { useEffect, useState } from "react";
import { GitStatus } from "../../bridge/commands";

// Whether the folder at `root` is a Git repository: null until known, and
// left unknown when the check itself fails, so creating still reports why.
export function useIsGitRepo(root: string | undefined, enabled: boolean): boolean | null {
  const [isRepo, setIsRepo] = useState<boolean | null>(null);
  useEffect(() => {
    setIsRepo(null);
    if (!enabled || !root) return;
    let cancelled = false;
    GitStatus(root)
      .then((status) => {
        if (!cancelled) setIsRepo(!!status?.isGitRepo);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [root, enabled]);
  return isRepo;
}

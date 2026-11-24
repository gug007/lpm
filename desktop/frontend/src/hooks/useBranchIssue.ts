import { useEffect, useState } from "react";
import { BranchIssue } from "../../bridge/commands";

// The issue a checkout's branch was started from, which its pull request
// closes; null when there is none.
export function useBranchIssue(cwd: string, branch: string, enabled: boolean): number | null {
  const [issue, setIssue] = useState<number | null>(null);
  useEffect(() => {
    setIssue(null);
    if (!enabled || !cwd) return;
    let cancelled = false;
    BranchIssue(cwd)
      .then((number) => {
        if (!cancelled) setIssue(number ?? null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [cwd, branch, enabled]);
  return issue;
}

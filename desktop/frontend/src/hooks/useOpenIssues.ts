import { useEffect, useState } from "react";
import { OpenIssues } from "../../bridge/commands";
import type { OpenIssue } from "../issues";

// The issues open in the repository at `root`, asked for afresh each time a
// picker opens: null while they're read.
export function useOpenIssues(root: string, open: boolean) {
  const [issues, setIssues] = useState<OpenIssue[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open || !root) return;
    let cancelled = false;
    setIssues(null);
    setError("");
    OpenIssues(root, true)
      .then((list) => {
        if (!cancelled) setIssues(list);
      })
      .catch((err) => {
        if (!cancelled) setError(String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [root, open]);

  return { issues, error };
}

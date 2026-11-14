import { useEffect, useRef, useState } from "react";
import { fullMessage } from "../commitRewrite";
import type { HistoryCommit } from "../gitHistory";

/** The Commit dialog's "Amend last commit" switch: on, the message becomes the
 *  last commit's for editing; off, the one typed before comes back. */
export function useCommitAmend(
  open: boolean,
  lastCommit: HistoryCommit | null,
  message: string,
  setMessage: (message: string) => void,
) {
  // Held from the moment it's switched on: a commit that lands while the dialog
  // is open must not become the one rewritten.
  const [picked, setPicked] = useState<HistoryCommit | null>(null);
  const before = useRef("");

  useEffect(() => {
    if (open) setPicked(null);
  }, [open]);

  const toggle = () => {
    if (picked) {
      setMessage(before.current);
      setPicked(null);
      return;
    }
    if (!lastCommit) return;
    before.current = message;
    setMessage(fullMessage(lastCommit));
    setPicked(lastCommit);
  };

  return { commit: picked ?? lastCommit, on: picked !== null, toggle };
}

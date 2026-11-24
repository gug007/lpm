import { useCallback, useRef, useState } from "react";
import { ReadIssue } from "../../bridge/commands";
import { toast } from "../notifications/toast";
import type { OpenIssue } from "../issues";

// The issue a New worktree dialog starts from, and the prompt read for it.
// `onPrompt` gets what its agent is told, once it's read.
export function useWorktreeIssue(root: string, onPrompt: (text: string) => void) {
  const [issue, setIssue] = useState<OpenIssue | null>(null);
  const [reading, setReading] = useState(false);
  // Told apart by number so an answer for an issue since put back is dropped.
  const asked = useRef(0);
  const deliver = useRef(onPrompt);
  deliver.current = onPrompt;

  const pick = useCallback(
    (next: OpenIssue) => {
      const ask = ++asked.current;
      setIssue(next);
      setReading(true);
      ReadIssue(root, next.number)
        .then((text) => text.prompt)
        .catch((err) => {
          toast.error(`Couldn't read issue #${next.number}: ${String(err)}`);
          return `Work on issue #${next.number}: ${next.title}\n${next.url}`;
        })
        .then((prompt) => {
          if (asked.current !== ask) return;
          setReading(false);
          deliver.current(prompt);
        });
    },
    [root],
  );

  const clear = useCallback(() => {
    asked.current += 1;
    setIssue(null);
    setReading(false);
  }, []);

  return { issue, reading, pick, clear };
}

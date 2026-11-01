import { useCallback, useEffect, useState } from "react";

/** Keeps a tab marked unread while it's the one in front from being read again
 *  at once: a finish on the front tab is retired by the next click or key
 *  (useClearStatusOnInteraction), which would undo the mark before the user
 *  ever left. The hold lasts until another tab comes to the front, so the
 *  finish is still waiting when they come back. */
export function useUnreadHold(inFront: string | null) {
  const [held, setHeld] = useState<string | null>(null);
  useEffect(() => {
    if (held !== null && held !== inFront) setHeld(null);
  }, [held, inFront]);
  const hold = useCallback(
    (terminalId: string) => {
      if (terminalId === inFront) setHeld(terminalId);
    },
    [inFront],
  );
  return { held, hold };
}

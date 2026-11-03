import { useCallback, useEffect, useState } from "react";
import { ClaudeLimitStop, DismissClaudeLimitStop } from "../../bridge/commands";
import { EventsOn } from "../../bridge/runtime";
import type { LimitStop } from "../claudeLimitStop";

// The limit a Claude tab stopped at, asked of the machine running it. That
// machine lists the project's terminals again whenever a stop comes or goes, so
// the listing is when to ask again. A stop belongs to the terminal it was asked
// for: a tab moved to a new terminal shows none until that one answers.
export function useLimitStop(projectName: string, terminalId: string) {
  const [held, setHeld] = useState<{ id: string; stop: LimitStop } | null>(null);
  const [asks, setAsks] = useState(0);

  useEffect(
    () =>
      EventsOn("terminals-changed", (project: string) => {
        if (project === projectName) setAsks((n) => n + 1);
      }),
    [projectName],
  );

  useEffect(() => {
    let live = true;
    ClaudeLimitStop(terminalId)
      .then((stop) => {
        if (!live) return;
        setHeld((was) =>
          was?.id === terminalId && JSON.stringify(was.stop) === JSON.stringify(stop)
            ? was
            : stop && { id: terminalId, stop },
        );
      })
      .catch(() => live && setHeld(null));
    return () => {
      live = false;
    };
  }, [terminalId, asks]);

  const dismiss = useCallback(() => {
    setHeld(null);
    DismissClaudeLimitStop(terminalId).catch(() => {});
  }, [terminalId]);

  return { stop: held?.id === terminalId ? held.stop : null, dismiss };
}

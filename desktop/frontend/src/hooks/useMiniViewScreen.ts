import { useEffect, useState } from "react";
import { hasInteractivePaneSession, interactivePaneOutputAt, interactiveSessions } from "../components/InteractivePane";
import { bufferLines } from "../components/terminal/consoleActions";
import { miniViewLines } from "../miniViewLines";

const POLL_MS = 400;

function sameLines(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((line, i) => line === b[i]);
}

/** The last lines on a terminal's screen, kept current while it draws and the
 *  window is on screen, and whether its session is still there (a closed tab's
 *  isn't). */
export function useMiniViewScreen(terminalId: string, rows: number): { lines: string[]; alive: boolean } {
  const [lines, setLines] = useState<string[]>([]);
  const [alive, setAlive] = useState(() => hasInteractivePaneSession(terminalId));

  useEffect(() => {
    let seen = -1;
    const read = () => {
      if (document.hidden) return;
      const live = hasInteractivePaneSession(terminalId);
      setAlive(live);
      const term = interactiveSessions.get(terminalId)?.term;
      const at = interactivePaneOutputAt(terminalId);
      if (!term || at === seen) return;
      seen = at;
      // A view taller than the pane reaches back into what scrolled off it.
      const top = term.buffer.active.baseY;
      const next = miniViewLines(bufferLines(term, Math.max(0, top - rows), top + term.rows), rows);
      setLines((prev) => (sameLines(prev, next) ? prev : next));
    };
    read();
    const timer = setInterval(read, POLL_MS);
    return () => clearInterval(timer);
  }, [terminalId, rows]);

  return { lines, alive };
}

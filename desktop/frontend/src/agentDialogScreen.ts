import { useEffect, useState } from "react";
import { interactivePaneOutputAt, interactiveSessions } from "./components/InteractivePane";
import { parseAgentDialog, sameDialog, type AgentDialog, type AgentDialogOption } from "./agentDialog";
import { bufferLines } from "./components/terminal/consoleActions";
import { sendTerminalInput } from "./terminal-io";

const POLL_MS = 400;

/** The dialog on a terminal's screen right now, or null when it shows none or
 *  this window holds no session for it. */
export function readAgentDialog(terminalId: string): AgentDialog | null {
  const term = interactiveSessions.get(terminalId)?.term;
  if (!term) return null;
  const top = term.buffer.active.baseY;
  return parseAgentDialog(bufferLines(term, top, top + term.rows), term.cols);
}

/** Picks `option` by typing its number, the way a keypress in the terminal
 *  would — unless the screen no longer shows the dialog it was picked from. */
export async function answerAgentDialog(
  terminalId: string,
  shown: AgentDialog,
  option: AgentDialogOption,
): Promise<"sent" | "changed"> {
  if (!sameDialog(readAgentDialog(terminalId), shown)) return "changed";
  await sendTerminalInput(terminalId, option.key);
  return "sent";
}

/** The dialog on a terminal's screen, kept current while it is open. */
export function useAgentDialog(terminalId: string | null): AgentDialog | null {
  const [dialog, setDialog] = useState<AgentDialog | null>(() =>
    terminalId ? readAgentDialog(terminalId) : null,
  );

  useEffect(() => {
    if (!terminalId) {
      setDialog(null);
      return;
    }
    let seenOutputAt = -1;
    const read = () => {
      const outputAt = interactivePaneOutputAt(terminalId);
      if (outputAt === seenOutputAt) return;
      seenOutputAt = outputAt;
      const next = readAgentDialog(terminalId);
      setDialog((prev) => (sameDialog(prev, next) ? prev : next));
    };
    read();
    const timer = setInterval(read, POLL_MS);
    return () => clearInterval(timer);
  }, [terminalId]);

  return dialog;
}

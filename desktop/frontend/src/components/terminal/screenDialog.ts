import type { Terminal } from "@xterm/xterm";
import { parseAgentDialog, type AgentDialog } from "../../agentDialog";
import { bufferLines } from "./consoleActions";

/** The dialog on a terminal's screen right now, or null when it shows none. */
export function screenDialog(term: Terminal): AgentDialog | null {
  const top = term.buffer.active.baseY;
  return parseAgentDialog(bufferLines(term, top, top + term.rows), term.cols);
}

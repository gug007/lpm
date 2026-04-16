import { interactiveSessions } from "../components/InteractivePane";

export function getTerminalSelection(terminalId: string): string {
  const session = interactiveSessions.get(terminalId);
  if (!session) return "";
  try {
    return session.term.getSelection();
  } catch {
    return "";
  }
}

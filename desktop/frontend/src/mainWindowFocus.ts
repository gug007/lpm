import { FocusMainWindow } from "../bridge/commands";
import { EventsEmit, EventsOn } from "../bridge/runtime";

const FOCUS_TERMINAL = "focus-main-terminal";

export interface TerminalTarget {
  projectName: string;
  terminalId: string;
}

/** From a detached window: bring the main window forward on one of its tabs. */
export function focusMainTerminal(projectName: string, terminalId: string): void {
  void FocusMainWindow();
  EventsEmit(FOCUS_TERMINAL, { projectName, terminalId } satisfies TerminalTarget);
}

/** The main window's side of `focusMainTerminal`. */
export function onFocusMainTerminal(handler: (target: TerminalTarget) => void): () => void {
  return EventsOn(FOCUS_TERMINAL, handler);
}

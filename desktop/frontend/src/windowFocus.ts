import { FocusMainWindow } from "../bridge/commands";
import { EventsEmit, EventsOn } from "../bridge/runtime";

const FOCUS_MAIN_TERMINAL = "focus-main-terminal";
const FOCUS_DETACHED_TERMINAL = "focus-detached-terminal";

export interface TerminalTarget {
  projectName: string;
  terminalId: string;
}

/** Where a project opens from this window: here, in the main window, or in its own. */
export type ProjectWindow = "here" | "main" | "own";

export function projectWindow(
  name: string,
  detached: ReadonlySet<string>,
  detachedSelf?: string,
): ProjectWindow {
  if (name === detachedSelf) return "here";
  if (detached.has(name)) return "own";
  return detachedSelf ? "main" : "here";
}

/** From a detached window: bring the main window forward on one of its tabs. */
export function focusMainTerminal(projectName: string, terminalId: string): void {
  void FocusMainWindow();
  EventsEmit(FOCUS_MAIN_TERMINAL, { projectName, terminalId } satisfies TerminalTarget);
}

/** The main window's side of `focusMainTerminal`. */
export function onFocusMainTerminal(handler: (target: TerminalTarget) => void): () => void {
  return EventsOn(FOCUS_MAIN_TERMINAL, handler);
}

/** Put one of a detached project's tabs on screen in its window. */
export function focusDetachedTerminal(projectName: string, terminalId: string): void {
  EventsEmit(FOCUS_DETACHED_TERMINAL, { projectName, terminalId } satisfies TerminalTarget);
}

/** A detached window's side of `focusDetachedTerminal`. */
export function onFocusDetachedTerminal(
  projectName: string,
  handler: (terminalId: string) => void,
): () => void {
  return EventsOn(FOCUS_DETACHED_TERMINAL, (target: TerminalTarget) => {
    if (target.projectName === projectName) handler(target.terminalId);
  });
}

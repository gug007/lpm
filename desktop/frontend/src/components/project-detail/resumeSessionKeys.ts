import { isMac } from "../../platform";

// Hiding a session while the search field keeps focus: ⌘⌫ on macOS. Elsewhere
// Ctrl+Backspace already deletes a word in the field, so hiding adds Shift.
export function isHideSessionChord(
  e: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "shiftKey" | "altKey">,
  mac: boolean = isMac,
): boolean {
  if (e.key !== "Backspace" && e.key !== "Delete") return false;
  if (mac) return e.metaKey;
  return e.ctrlKey && e.shiftKey && !e.altKey && !e.metaKey;
}

export const HIDE_SESSION_LABEL = isMac ? "⌘⌫" : "Ctrl+Shift+Backspace";

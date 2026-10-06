import { isMac } from "../../platform";
import { chordLetter, isAltGraphChar, type KeyEventLike } from "../../keyEvents";
import { isBoundChord } from "../../hooks/useKeyboardShortcut";

// Whether an interactive terminal hands a key to the app instead of its PTY.
// macOS: every ⌘ chord. Elsewhere app chords share Ctrl with the shell, so only
// a chord lpm has bound right now leaves, plus Ctrl+Shift+letter — the
// terminal-app namespace (⌘+letter's physical form) that shells never need.
// Plain Ctrl+letter (^C, ^D, ^R, ^W…), Alt chords and AltGr characters stay.
export function terminalYieldsToApp(
  e: KeyEventLike,
  isBound: (e: KeyEventLike) => boolean = isBoundChord,
  mac: boolean = isMac,
): boolean {
  if (mac) return e.metaKey;
  if (e.metaKey) return true;
  if (isAltGraphChar(e)) return false;
  if (!e.ctrlKey && !e.altKey) return false;
  if (isBound(e)) return true;
  return e.ctrlKey && e.shiftKey && !e.altKey && chordLetter(e) !== null;
}

// Read-only terminals (service logs, filter results) have no shell to feed, so
// off macOS every modified key goes to the app; xterm would otherwise turn it
// into a control character and swallow it.
export function readOnlyTerminalYields(e: KeyEventLike, mac: boolean = isMac): boolean {
  return !mac && (e.ctrlKey || e.altKey || e.metaKey);
}

import { matchesShortcut } from "./hooks/useKeyboardShortcut";
import type { KeyEventLike } from "./keyEvents";
import { chordLabel, type Chord } from "./keys";
import { isMac } from "./platform";

// ⌘, and ⌘Q come from the native app menu on macOS; elsewhere the app UI binds
// their physical forms, so Quit is Ctrl+Shift+Q and plain Ctrl+Q stays with the
// terminal.
export const SETTINGS_CHORD: Chord = { key: ",", meta: true };
export const QUIT_CHORD: Chord = { key: "q", meta: true, shift: false, alt: false };

export const QUIT_LABEL = chordLabel(QUIT_CHORD);

export function isQuitChord(e: KeyEventLike, mac: boolean = isMac): boolean {
  return matchesShortcut(e, QUIT_CHORD, mac);
}

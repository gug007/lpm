import { useEffect, useRef } from "react";
import { useEventListener } from "./useEventListener";
import { firesForTarget } from "../shortcutScope";
import { isMac } from "../platform";
import { toPhysical } from "../keys";
import { chordLetter, isAltGraphChar, isAsciiLetter, type KeyEventLike } from "../keyEvents";

export interface KeyboardShortcut {
  /** The `KeyboardEvent.key` value to match (case-insensitive, e.g. "b", "Escape", "="). */
  key: string;
  /**
   * Require ⌘. On macOS Ctrl also counts; elsewhere the chord matches its
   * physical form only (keys.ts toPhysical: ⌘T is Ctrl+Shift+T, never Ctrl+T).
   */
  meta?: boolean;
  /** Require Shift. When omitted, shift state is ignored. */
  shift?: boolean;
  /**
   * Require Alt/Option. When omitted, alt state is ignored, except that off
   * macOS a ⌘+letter chord then never matches Ctrl+Alt+letter (⌘⌥letter).
   */
  alt?: boolean;
  /** Call `event.preventDefault()` when the shortcut fires. Defaults to true. */
  preventDefault?: boolean;
  /**
   * Fire even while the user is typing in a text scope (`[data-text-scope]`).
   * Defaults to true. Set false for chrome that would steal focus or reflow the
   * layout out from under a half-written prompt.
   */
  whileTyping?: boolean;
}

function matchesMac(event: KeyEventLike, shortcut: KeyboardShortcut): boolean {
  if (event.key.toLowerCase() !== shortcut.key.toLowerCase()) return false;
  if (shortcut.meta !== undefined) {
    const mod = event.metaKey || event.ctrlKey;
    if (mod !== shortcut.meta) return false;
  }
  if (shortcut.shift !== undefined && event.shiftKey !== shortcut.shift) return false;
  if (shortcut.alt !== undefined && event.altKey !== shortcut.alt) return false;
  return true;
}

const EITHER = [false, true];

function optionalModsMatch(event: KeyEventLike, shortcut: KeyboardShortcut): boolean {
  if (shortcut.shift !== undefined && event.shiftKey !== shortcut.shift) return false;
  return shortcut.alt === undefined || event.altKey === shortcut.alt;
}

function matchesPhysical(event: KeyEventLike, shortcut: KeyboardShortcut): boolean {
  const chord = shortcut.meta || shortcut.alt;
  // A letter chord follows the physical key on non-Latin layouts (Cyrillic "е"
  // on the T key is still Ctrl+Shift+T).
  const pressed =
    chord && isAsciiLetter(shortcut.key) ? chordLetter(event) : event.key.toLowerCase();
  if (pressed !== shortcut.key.toLowerCase()) return false;
  if (chord && isAltGraphChar(event)) return false;
  if (shortcut.meta === undefined) return optionalModsMatch(event, shortcut);
  if (event.metaKey || event.ctrlKey !== shortcut.meta) return false;
  if (!shortcut.meta || !isAsciiLetter(shortcut.key)) return optionalModsMatch(event, shortcut);
  // A letter chord's Shift/Alt pick its physical tier. An omitted Shift means
  // either authored variant (⌘X or ⌘⇧X); an omitted Alt means no ⌘⌥ variant,
  // whose Ctrl+Alt+letter form is the shell's C-M-letter.
  const shifts = shortcut.shift === undefined ? EITHER : [shortcut.shift];
  const alts = [shortcut.alt ?? false];
  return shifts.some((shift) =>
    alts.some((alt) => {
      const p = toPhysical({ key: shortcut.key, meta: true, shift, alt }, false);
      return event.shiftKey === p.shift && event.altKey === p.alt;
    }),
  );
}

export function matchesShortcut(
  event: KeyEventLike,
  shortcut: KeyboardShortcut,
  mac: boolean = isMac,
): boolean {
  return mac ? matchesMac(event, shortcut) : matchesPhysical(event, shortcut);
}

// Modifier chords of every live useKeyboardShortcut, so a focused terminal can
// hand them to the app instead of the shell (off macOS, where they share Ctrl
// with the shell's own keys).
const liveChords = new Set<{ current: KeyboardShortcut[] }>();

export function isBoundChord(event: KeyEventLike, mac: boolean = isMac): boolean {
  for (const ref of liveChords) {
    for (const s of ref.current) {
      if ((s.meta || s.alt) && matchesShortcut(event, s, mac)) return true;
    }
  }
  return false;
}

export function useKeyboardShortcut(
  shortcut: KeyboardShortcut | KeyboardShortcut[],
  handler: (event: KeyboardEvent, matched: KeyboardShortcut) => void,
  enabled: boolean = true,
  // Listen in the capture phase so the shortcut fires ahead of focus-context
  // handlers that stop keydown propagation. Prefer the default (bubble) plus
  // `whileTyping` for app chrome; capture is for combos that must beat a field's
  // own Ctrl-chord handling, and it also runs ahead of dialogs and the shortcut
  // recorder, so gate it at the call site.
  capture: boolean = false,
) {
  const shortcutsRef = useRef<KeyboardShortcut[]>([]);
  shortcutsRef.current = Array.isArray(shortcut) ? shortcut : [shortcut];

  useEffect(() => {
    if (isMac || !enabled) return;
    liveChords.add(shortcutsRef);
    return () => {
      liveChords.delete(shortcutsRef);
    };
  }, [enabled]);

  useEventListener(
    "keydown",
    (event) => {
      for (const s of shortcutsRef.current) {
        if (!matchesShortcut(event, s)) continue;
        // `return`, not `continue`: a shortcut that stands down must not fall
        // through to a lower-priority entry in the same array.
        if (!firesForTarget(s, event.target)) return;
        if (s.preventDefault !== false) event.preventDefault();
        handler(event, s);
        return;
      }
    },
    window,
    enabled,
    capture,
  );
}

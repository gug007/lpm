import { useRef } from "react";
import { useEventListener } from "./useEventListener";

export interface KeyboardShortcut {
  /** The `KeyboardEvent.key` value to match (case-insensitive, e.g. "b", "Escape", "="). */
  key: string;
  /** Require Cmd (macOS) or Ctrl (other platforms). Matches either. */
  meta?: boolean;
  /** Require Shift. When omitted, shift state is ignored. */
  shift?: boolean;
  /** Require Alt/Option. When omitted, alt state is ignored. */
  alt?: boolean;
  /** Call `event.preventDefault()` when the shortcut fires. Defaults to true. */
  preventDefault?: boolean;
}

function matches(event: KeyboardEvent, shortcut: KeyboardShortcut): boolean {
  if (event.key.toLowerCase() !== shortcut.key.toLowerCase()) return false;
  if (shortcut.meta !== undefined) {
    const mod = event.metaKey || event.ctrlKey;
    if (mod !== shortcut.meta) return false;
  }
  if (shortcut.shift !== undefined && event.shiftKey !== shortcut.shift) return false;
  if (shortcut.alt !== undefined && event.altKey !== shortcut.alt) return false;
  return true;
}

/**
 * Runs `handler` when the user presses a key combo matching `shortcut`.
 *
 * `shortcut.meta: true` matches either Cmd or Ctrl (so shortcuts work on
 * macOS and other platforms without a separate binding).
 *
 * By default the matching event's `preventDefault()` is called — set
 * `shortcut.preventDefault: false` to opt out.
 *
 * Pass an array of shortcuts to bind several combos to the same handler
 * (the matched `KeyboardShortcut` is passed as the second argument).
 *
 * Pass `enabled: false` to temporarily disable the binding.
 */
export function useKeyboardShortcut(
  shortcut: KeyboardShortcut | KeyboardShortcut[],
  handler: (event: KeyboardEvent, matched: KeyboardShortcut) => void,
  enabled: boolean = true,
) {
  const shortcutsRef = useRef<KeyboardShortcut[]>([]);
  shortcutsRef.current = Array.isArray(shortcut) ? shortcut : [shortcut];

  useEventListener(
    "keydown",
    (event) => {
      for (const s of shortcutsRef.current) {
        if (matches(event, s)) {
          if (s.preventDefault !== false) event.preventDefault();
          handler(event, s);
          return;
        }
      }
    },
    window,
    enabled,
  );
}

import { useRef } from "react";
import { useEventListener } from "./useEventListener";
import { firesForTarget } from "../shortcutScope";

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
  /**
   * Fire even while the user is typing in a text scope (`[data-text-scope]`).
   * Defaults to true. Set false for chrome that would steal focus or reflow the
   * layout out from under a half-written prompt.
   */
  whileTyping?: boolean;
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

  useEventListener(
    "keydown",
    (event) => {
      for (const s of shortcutsRef.current) {
        if (!matches(event, s)) continue;
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

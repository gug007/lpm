import { useState } from "react";
import { useEventListener } from "./useEventListener";
import { canonicalShortcut, formatShortcut, isReservedShortcut } from "../shortcutParse";
import type { KeyboardShortcut } from "./useKeyboardShortcut";

interface Options {
  reserved?: ReadonlySet<string>;
  onCapture: (canonical: string) => void;
}

interface ShortcutCapture {
  recording: boolean;
  hint: string | null;
  toggle: () => void;
}

// Records a keyboard combo. WKWebView doesn't focus a <button> on click, so a
// button-level onKeyDown never fires — we listen on window in the capture phase
// while recording, which also blocks the combo from reaching lpm's own shortcuts.
export function useShortcutCapture({ reserved, onCapture }: Options): ShortcutCapture {
  const [recording, setRecording] = useState(false);
  const [hint, setHint] = useState<string | null>(null);

  useEventListener(
    "keydown",
    (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.key === "Escape") {
        setRecording(false);
        setHint(null);
        return;
      }
      if (["Meta", "Shift", "Alt", "Control"].includes(event.key)) return;
      const shortcut: KeyboardShortcut = {
        key: event.key.length === 1 ? event.key.toLowerCase() : event.key,
        meta: event.metaKey || event.ctrlKey,
        shift: event.shiftKey,
        alt: event.altKey,
      };
      if (!shortcut.meta && !shortcut.alt) {
        setHint("Add ⌘ or ⌥ to make a shortcut");
        return;
      }
      if (isReservedShortcut(shortcut, reserved)) {
        setHint(`${formatShortcut(shortcut)} is reserved by lpm`);
        return;
      }
      onCapture(canonicalShortcut(shortcut));
      setRecording(false);
      setHint(null);
    },
    window,
    recording,
    true,
  );

  return {
    recording,
    hint,
    toggle: () => {
      setHint(null);
      setRecording((on) => !on);
    },
  };
}

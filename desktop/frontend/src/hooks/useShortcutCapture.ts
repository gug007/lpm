import { useState } from "react";
import { useEventListener } from "./useEventListener";
import { captureShortcut } from "../shortcutRecord";

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
      const result = captureShortcut(event, reserved);
      if (result.kind === "ignore") return;
      if (result.kind === "hint") {
        setHint(result.text);
        return;
      }
      onCapture(result.canonical);
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

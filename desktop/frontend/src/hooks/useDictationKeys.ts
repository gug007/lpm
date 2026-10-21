import { useEffect } from "react";
import { useDictationStore, type DictationPhase } from "../store/dictation";
import { isImeComposing } from "../imeComposing";

// While dictating, Return finishes and inserts the text and Esc cancels —
// taken ahead of the composer, whose own Return would send the half-spoken
// prompt. An error notice gives Esc back once it's dismissed.
export function useDictationKeys(phase: DictationPhase) {
  useEffect(() => {
    if (phase === "idle") return;
    const onKey = (e: KeyboardEvent) => {
      if (isImeComposing(e)) return;
      const { stop, cancel } = useDictationStore.getState();
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopImmediatePropagation();
        cancel();
      } else if (e.key === "Enter" && phase !== "error") {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (phase === "recording") stop();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [phase]);
}

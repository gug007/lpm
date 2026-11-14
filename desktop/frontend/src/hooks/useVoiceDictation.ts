import { useCallback, useRef, useState } from "react";
import { toast } from "../notifications/toast";
import { VoiceToTextAvailable } from "../../bridge/commands";
import { isMac } from "../platform";
import { captureDictationTarget, focusDictationField, type DictationTarget } from "../dictation/insert";
import { ACTIVE_PHASES, useDictationStore } from "../store/dictation";

// VoiceToText is a macOS app; elsewhere the composer offers no dictation.
export const DICTATION_AVAILABLE = isMac;

// Shared dictation control: starts lpm's recorder on VoiceToText — the text
// goes into the field that has focus now, so callers keep focus on their input
// while toggling — or stops it, or surfaces the install prompt when the app
// isn't there.
export function useVoiceDictation() {
  const [installOpen, setInstallOpen] = useState(false);
  const pending = useRef<DictationTarget | null>(null);
  const phase = useDictationStore((s) => s.phase);
  const active = ACTIVE_PHASES.has(phase);

  // `into` is the field the mic belongs to, and so where the words go;
  // without it, whichever field has focus.
  const toggle = useCallback(async (into?: HTMLElement | null) => {
    const { phase, start, stop, cancel } = useDictationStore.getState();
    if (phase === "recording") return stop();
    if (phase === "transcribing") return;
    if (ACTIVE_PHASES.has(phase)) return cancel();
    if (into) focusDictationField(into);
    const target = captureDictationTarget(into ?? document.activeElement);
    try {
      if (!(await VoiceToTextAvailable())) {
        pending.current = target;
        setInstallOpen(true);
        return;
      }
      await start(target);
    } catch (err) {
      toast.error(`Voice dictation failed: ${err}`);
    }
  }, []);

  // The install prompt saw VoiceToText arrive: record into the field the
  // first press was meant for.
  const startAfterInstall = useCallback(async () => {
    setInstallOpen(false);
    const target = pending.current;
    pending.current = null;
    if (target) focusDictationField(target.element);
    try {
      await useDictationStore.getState().start(target);
    } catch (err) {
      toast.error(`Voice dictation failed: ${err}`);
    }
  }, []);

  return { toggle, phase, active, installOpen, setInstallOpen, startAfterInstall };
}

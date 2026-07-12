import { useCallback, useState } from "react";
import { toast } from "../toast";
import { VoiceToTextAvailable, VoiceToTextToggle } from "../../bridge/commands";

// Shared dictation control: toggles VoiceToText, or surfaces the install prompt
// when the helper app isn't present. The dictated text pastes into whatever
// field holds focus, so callers keep focus on their input while toggling.
export function useVoiceDictation() {
  const [installOpen, setInstallOpen] = useState(false);

  const toggle = useCallback(async () => {
    try {
      if (!(await VoiceToTextAvailable())) {
        setInstallOpen(true);
        return;
      }
      await VoiceToTextToggle();
    } catch (err) {
      toast.error(`Voice dictation failed: ${err}`);
    }
  }, []);

  return { toggle, installOpen, setInstallOpen };
}

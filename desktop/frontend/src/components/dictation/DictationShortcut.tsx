import { dictationShortcutField } from "../../dictation/shortcutTarget";
import { useDictateShortcut } from "../../hooks/useDictateShortcut";
import { useKeyboardShortcut } from "../../hooks/useKeyboardShortcut";
import { DICTATION_AVAILABLE, useVoiceDictation } from "../../hooks/useVoiceDictation";
import { toast } from "../../notifications/toast";
import { ACTIVE_PHASES, useDictationStore } from "../../store/dictation";
import { blockingDialogOpen } from "../ui/blockingDialog";
import { VoiceToTextInstallModal } from "../VoiceToTextInstallModal";

/** The Dictate hotkey: starts dictating into the input you're in (or the
 *  focused terminal's input), and a second press inserts what was said. */
export function DictationShortcut() {
  const { toggle, installOpen, setInstallOpen, startAfterInstall } = useVoiceDictation();
  const { shortcut } = useDictateShortcut();

  useKeyboardShortcut(
    shortcut ? [shortcut] : [],
    (event) => {
      if (event.repeat) return;
      if (ACTIVE_PHASES.has(useDictationStore.getState().phase)) {
        void toggle();
        return;
      }
      if (blockingDialogOpen()) return;
      const field = dictationShortcutField();
      if (!field) {
        toast.info("Click into an input to dictate", { description: "Or open the input under a terminal with ⌘I." });
        return;
      }
      void toggle(field);
    },
    DICTATION_AVAILABLE && shortcut !== null,
  );

  return (
    <VoiceToTextInstallModal
      open={installOpen}
      onClose={() => setInstallOpen(false)}
      onInstalled={() => void startAfterInstall()}
    />
  );
}

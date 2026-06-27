import { useState, type MouseEvent } from "react";
import { toast } from "sonner";
import { VoiceToTextAvailable, VoiceToTextToggle } from "../../bridge/commands";
import { MicIcon } from "./icons";
import { VoiceToTextInstallModal } from "./VoiceToTextInstallModal";

export function ComposerMicButton() {
  const [installOpen, setInstallOpen] = useState(false);

  // Don't pull focus off the composer editor, so the dictated text pastes there.
  const keepEditorFocus = (e: MouseEvent) => e.preventDefault();

  const toggle = async () => {
    try {
      if (!(await VoiceToTextAvailable())) {
        setInstallOpen(true);
        return;
      }
      await VoiceToTextToggle();
    } catch (err) {
      toast.error(`Voice dictation failed: ${err}`);
    }
  };

  return (
    <>
      <button
        type="button"
        onMouseDown={keepEditorFocus}
        onClick={() => void toggle()}
        aria-label="Dictate"
        title="Dictate with VoiceToText"
        className="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
      >
        <MicIcon />
      </button>
      <VoiceToTextInstallModal open={installOpen} onClose={() => setInstallOpen(false)} />
    </>
  );
}

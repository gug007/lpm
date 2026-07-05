import { type MouseEvent } from "react";
import { useVoiceDictation } from "../hooks/useVoiceDictation";
import { MicIcon } from "./icons";
import { VoiceToTextInstallModal } from "./VoiceToTextInstallModal";
import { Tooltip } from "./ui/Tooltip";
import { COMPOSER_TOOLTIP_DELAY_MS } from "../composerText";

export function ComposerMicButton() {
  const { toggle, installOpen, setInstallOpen } = useVoiceDictation();

  // Don't pull focus off the composer editor, so the dictated text pastes there.
  const keepEditorFocus = (e: MouseEvent) => e.preventDefault();

  return (
    <>
      <Tooltip content="Dictate" delay={COMPOSER_TOOLTIP_DELAY_MS}>
        <button
          type="button"
          onMouseDown={keepEditorFocus}
          onClick={() => void toggle()}
          aria-label="Dictate"
          className="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
        >
          <MicIcon />
        </button>
      </Tooltip>
      <VoiceToTextInstallModal open={installOpen} onClose={() => setInstallOpen(false)} />
    </>
  );
}

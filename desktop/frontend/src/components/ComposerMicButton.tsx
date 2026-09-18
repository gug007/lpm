import { type MouseEvent } from "react";
import { useVoiceDictation } from "../hooks/useVoiceDictation";
import type { ComposerToolVariant } from "../composerTools";
import { MicIcon } from "./icons";
import { VoiceToTextInstallModal } from "./VoiceToTextInstallModal";
import { ContextMenuItem } from "./ui/ContextMenuItem";
import { Tooltip } from "./ui/Tooltip";
import { COMPOSER_TOOLTIP_DELAY_MS } from "../composerText";

interface ComposerMicButtonProps {
  disabled?: boolean;
  variant?: ComposerToolVariant;
  // Row only: the menu holding the row, told to fold away once dictation starts.
  onPick?: () => void;
}

export function ComposerMicButton({ disabled, variant = "button", onPick }: ComposerMicButtonProps) {
  const { toggle, installOpen, setInstallOpen } = useVoiceDictation();

  // Don't pull focus off the composer editor, so the dictated text pastes there.
  const keepEditorFocus = (e: MouseEvent) => e.preventDefault();

  return (
    <>
      {variant === "row" ? (
        <ContextMenuItem
          label="Dictate"
          icon={<MicIcon size={13} />}
          onMouseDown={keepEditorFocus}
          onClick={() => {
            onPick?.();
            void toggle();
          }}
          disabled={disabled}
        />
      ) : (
        <Tooltip content="Dictate" delay={COMPOSER_TOOLTIP_DELAY_MS}>
          <button
            type="button"
            onMouseDown={keepEditorFocus}
            onClick={() => void toggle()}
            disabled={disabled}
            aria-label="Dictate"
            className="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--composer-fg-muted)] transition-colors hover:bg-[var(--composer-hover-bg)] hover:text-[var(--composer-fg)] disabled:pointer-events-none disabled:opacity-40"
          >
            <MicIcon />
          </button>
        </Tooltip>
      )}
      <VoiceToTextInstallModal open={installOpen} onClose={() => setInstallOpen(false)} />
    </>
  );
}

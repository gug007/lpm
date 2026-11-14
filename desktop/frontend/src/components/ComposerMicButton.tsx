import { type MouseEvent, type RefObject } from "react";
import { useVoiceDictation } from "../hooks/useVoiceDictation";
import { useDictateShortcut } from "../hooks/useDictateShortcut";
import type { ComposerToolVariant } from "../composerTools";
import { MicIcon, StopIcon } from "./icons";
import { DictationSpinner } from "./dictation/DictationSpinner";
import { VoiceToTextInstallModal } from "./VoiceToTextInstallModal";
import { ContextMenuItem } from "./ui/ContextMenuItem";
import { Tooltip } from "./ui/Tooltip";
import { COMPOSER_TOOLTIP_DELAY_MS } from "../composerText";
import { SEND_SHELL_CLASS, sendGlow, sendShellTint } from "./composerSendStyles";

interface ComposerMicButtonProps {
  // The field this mic dictates into, whatever has focus when it's pressed.
  into?: RefObject<HTMLElement | null>;
  disabled?: boolean;
  variant?: ComposerToolVariant;
  // Row only: the menu holding the row, told to fold away once dictation starts.
  onPick?: () => void;
  // Standing in for Send while there's nothing to send: the composer's primary
  // button, dressed exactly like a live Send — red while it records.
  prominent?: boolean;
}

export function ComposerMicButton({ into, disabled, variant = "button", onPick, prominent = false }: ComposerMicButtonProps) {
  const { toggle, phase, active, installOpen, setInstallOpen, startAfterInstall } = useVoiceDictation();
  const { label: shortcutLabel } = useDictateShortcut();
  const label =
    phase === "recording"
      ? "Stop and insert"
      : phase === "transcribing"
        ? "Transcribing…"
        : active
          ? "Cancel dictation"
          : "Dictate";
  // As the primary button mid-take it says what a press does now: stop, or
  // nothing while the words are transcribed.
  const primaryIcon = !active ? <MicIcon /> : phase === "transcribing" ? <DictationSpinner /> : <StopIcon />;

  // Don't pull focus off the composer editor, so the dictated text pastes there.
  const keepEditorFocus = (e: MouseEvent) => e.preventDefault();
  const buttonProps = {
    type: "button" as const,
    onMouseDown: keepEditorFocus,
    onClick: () => void toggle(into?.current),
    disabled,
    "aria-label": label,
    "aria-pressed": active,
  };

  return (
    <>
      {variant === "row" ? (
        <ContextMenuItem
          label={label}
          icon={<MicIcon size={13} />}
          onMouseDown={keepEditorFocus}
          onClick={() => {
            onPick?.();
            void toggle(into?.current);
          }}
          disabled={disabled}
        />
      ) : (
        <Tooltip
          content={!active && shortcutLabel ? `${label}  ·  ${shortcutLabel}` : label}
          delay={COMPOSER_TOOLTIP_DELAY_MS}
        >
          {prominent ? (
            <div
              className={`${SEND_SHELL_CLASS} ${active ? "bg-[var(--accent-red)]" : sendShellTint(false)}`}
              style={sendGlow(false, active ? "var(--accent-red)" : undefined)}
            >
              <button
                {...buttonProps}
                className="flex h-7 items-center justify-center rounded-lg px-3.5 text-[var(--bg-primary)] transition-colors hover:bg-black/10 active:bg-black/20 disabled:pointer-events-none disabled:opacity-40"
              >
                {primaryIcon}
              </button>
            </div>
          ) : (
            <button
              {...buttonProps}
              className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors disabled:pointer-events-none disabled:opacity-40 ${
                active
                  ? "bg-[var(--accent-red)]/12 text-[var(--accent-red)]"
                  : "text-[var(--composer-fg-muted)] hover:bg-[var(--composer-hover-bg)] hover:text-[var(--composer-fg)]"
              }`}
            >
              <MicIcon />
            </button>
          )}
        </Tooltip>
      )}
      <VoiceToTextInstallModal
        open={installOpen}
        onClose={() => setInstallOpen(false)}
        onInstalled={() => void startAfterInstall()}
      />
    </>
  );
}

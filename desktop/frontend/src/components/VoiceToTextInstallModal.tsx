import { useEffect, useState } from "react";
import { Modal } from "./ui/Modal";
import { BTN_QUIET } from "./ui/buttons";
import { BrowserOpenURL } from "../../bridge/runtime";
import { MicIcon, DownloadIcon, DetachIcon } from "./icons";
import { useVoiceToTextWatch } from "../hooks/useVoiceToTextWatch";
import { VoiceToTextSteps, type VoiceToTextStep } from "./VoiceToTextSteps";

const DOWNLOAD_URL =
  "https://github.com/gug007/voice-to-text/releases/latest/download/VoiceToText.dmg";
const HOME_URL = "https://voicetotext.cc";

const FIRST_STEPS: VoiceToTextStep[] = [
  { text: "Download VoiceToText and drag it into Applications.", state: "todo" },
  { text: "Open it, then allow Microphone and Accessibility access.", state: "todo" },
  { text: "Dictation starts here by itself once it's installed.", state: "todo" },
];

const WAITING_STEPS: VoiceToTextStep[] = [
  { text: "Download started: VoiceToText.dmg", state: "done" },
  { text: "Open it and drag VoiceToText into Applications.", state: "now", note: "Checking…" },
  { text: "Allow Microphone and Accessibility access when it asks.", state: "todo" },
];

const LINK_BTN =
  "flex min-w-0 items-center gap-1.5 rounded text-[11px] text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)] focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--text-muted)]";

interface VoiceToTextInstallModalProps {
  open: boolean;
  onClose: () => void;
  /** VoiceToText turned up while the dialog waited for it. */
  onInstalled?: () => void;
}

export function VoiceToTextInstallModal({ open, onClose, onInstalled }: VoiceToTextInstallModalProps) {
  const [waiting, setWaiting] = useState(false);

  useEffect(() => {
    if (!open) setWaiting(false);
  }, [open]);

  useVoiceToTextWatch(open && waiting, () => (onInstalled ?? onClose)());

  const download = () => {
    BrowserOpenURL(DOWNLOAD_URL);
    setWaiting(true);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      // Above the composer actions popover (z-80) that can open this while
      // staying open behind it, and so above the modals hosting either.
      zIndexClassName="z-[90]"
      backdropClassName="bg-black/50 backdrop-blur-sm"
      contentClassName="field-reveal w-[420px] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] shadow-2xl shadow-black/40"
    >
      <div className="flex items-start gap-3.5 px-5 pt-5">
        <div className="relative shrink-0">
          <div
            aria-hidden
            className="absolute -inset-1 rounded-2xl bg-[var(--accent-cyan)]/15 blur-lg"
          />
          <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--accent-cyan)]/10 text-[var(--accent-cyan)] ring-1 ring-inset ring-[var(--accent-cyan)]/20 [&>svg]:h-[18px] [&>svg]:w-[18px]">
            <MicIcon />
          </div>
        </div>
        <div className="min-w-0 pt-0.5">
          <div className="flex items-center gap-2">
            <h3 className="text-[15px] font-semibold tracking-[-0.01em] text-[var(--text-primary)]">
              {waiting ? "Setting up VoiceToText" : "Install VoiceToText"}
            </h3>
            {!waiting && (
              <span className="rounded-full border border-[var(--border)] px-1.5 py-px text-[10px] font-medium uppercase tracking-[0.07em] text-[var(--text-muted)]">
                Free
              </span>
            )}
          </div>
          <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--text-secondary)]" aria-live="polite">
            {waiting
              ? "Keep this open. Dictation starts by itself as soon as VoiceToText is in Applications."
              : "Dictation runs on VoiceToText — an offline speech-to-text app for macOS. Once it's installed, the mic button records and types straight into the composer."}
          </p>
        </div>
      </div>

      <VoiceToTextSteps steps={waiting ? WAITING_STEPS : FIRST_STEPS} />

      <div className="mt-5 flex items-center justify-between gap-3 border-t border-[var(--border)] px-5 py-3.5">
        {waiting ? (
          <button type="button" onClick={() => BrowserOpenURL(DOWNLOAD_URL)} className={LINK_BTN}>
            <DownloadIcon size={11} />
            <span className="truncate">Download again</span>
          </button>
        ) : (
          <button type="button" onClick={() => BrowserOpenURL(HOME_URL)} className={LINK_BTN}>
            <DetachIcon size={11} />
            <span className="truncate">voicetotext.cc</span>
          </button>
        )}
        <div className="flex shrink-0 items-center gap-2">
          <button type="button" onClick={onClose} className={BTN_QUIET}>
            {waiting ? "Cancel" : "Not now"}
          </button>
          {!waiting && (
            <button
              type="button"
              autoFocus
              onClick={download}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--text-primary)] px-3 py-1.5 text-xs font-medium text-[var(--bg-primary)] transition-all hover:opacity-90 active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--text-muted)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-primary)]"
            >
              <DownloadIcon size={13} />
              Download
              <kbd className="ml-1 inline-flex h-[15px] min-w-[15px] items-center justify-center rounded border border-[var(--bg-primary)]/30 px-1 text-[10px] leading-none opacity-60">
                ⏎
              </kbd>
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}

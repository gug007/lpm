import { Modal } from "./ui/Modal";
import { BrowserOpenURL } from "../../bridge/runtime";
import { MicIcon, DownloadIcon, DetachIcon } from "./icons";

const DOWNLOAD_URL =
  "https://github.com/gug007/voice-to-text/releases/latest/download/VoiceToText.dmg";
const HOME_URL = "https://voicetotext.cc";

const STEPS = [
  "Download VoiceToText and drag it into Applications.",
  "Open it, then allow Microphone and Accessibility access.",
  "Return here and tap the mic to start dictating.",
];

interface VoiceToTextInstallModalProps {
  open: boolean;
  onClose: () => void;
}

export function VoiceToTextInstallModal({ open, onClose }: VoiceToTextInstallModalProps) {
  const download = () => {
    BrowserOpenURL(DOWNLOAD_URL);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      zIndexClassName="z-[60]"
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
              Install VoiceToText
            </h3>
            <span className="rounded-full border border-[var(--border)] px-1.5 py-px text-[10px] font-medium uppercase tracking-[0.07em] text-[var(--text-muted)]">
              Free
            </span>
          </div>
          <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--text-secondary)]">
            Dictation runs on VoiceToText — an offline speech-to-text app for macOS. Once it&apos;s
            installed, the mic button records and types straight into the composer.
          </p>
        </div>
      </div>

      <ol className="mt-5 space-y-3 px-5">
        {STEPS.map((step, i) => (
          <li key={i} className="relative flex gap-3">
            {i < STEPS.length - 1 && (
              <span
                aria-hidden
                className="absolute -bottom-3 left-[9.5px] top-5 w-px bg-[var(--border)]"
              />
            )}
            <span className="relative z-10 mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--bg-secondary)] text-[10px] font-medium tabular-nums text-[var(--text-muted)]">
              {i + 1}
            </span>
            <span className="pt-px text-[13px] leading-snug text-[var(--text-secondary)]">
              {step}
            </span>
          </li>
        ))}
      </ol>

      <div className="mt-5 flex items-center justify-between gap-3 border-t border-[var(--border)] px-5 py-3.5">
        <button
          type="button"
          onClick={() => BrowserOpenURL(HOME_URL)}
          className="flex min-w-0 items-center gap-1.5 rounded text-[11px] text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)] focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--text-muted)]"
        >
          <DetachIcon size={11} />
          <span className="truncate">voicetotext.cc</span>
        </button>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--text-muted)]"
          >
            Not now
          </button>
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
        </div>
      </div>
    </Modal>
  );
}

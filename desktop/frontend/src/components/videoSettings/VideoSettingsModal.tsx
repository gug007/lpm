import { closeVideoSettings, useVideoSettings } from "../../store/videoSettings";
import { VideoIcon } from "../icons";
import { BTN_PRIMARY } from "../ui/buttons";
import { Modal } from "../ui/Modal";
import { VideoSettingsBody } from "./VideoSettingsBody";

// Who narrates video answers, the key the cloud voice bills, and what this Mac
// needs for videos. Mounted once per window, beside the setup window, which
// opens on top of it from the Setup row.
export function VideoSettingsModal() {
  const open = useVideoSettings((s) => s.open);
  return (
    <Modal
      open={open}
      onClose={closeVideoSettings}
      zIndexClassName="z-[90]"
      backdropClassName="bg-black/50 backdrop-blur-sm"
      contentClassName="field-reveal w-[520px] max-w-[calc(100vw-32px)] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] shadow-2xl shadow-black/40"
    >
      <div className="flex items-start gap-3 px-5 pt-5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--accent-violet)]/15 text-[var(--accent-violet)] [&>svg]:h-[17px] [&>svg]:w-[17px]">
          <VideoIcon />
        </span>
        <div className="min-w-0 pt-0.5">
          <h3 className="text-[15px] font-semibold tracking-[-0.01em] text-[var(--text-primary)]">Video settings</h3>
          <p className="mt-0.5 text-[12px] leading-relaxed text-[var(--text-muted)]">
            Narrated video answers from the composer, recorded on this Mac.
          </p>
        </div>
      </div>
      <VideoSettingsBody />
      <div className="flex justify-end border-t border-[var(--border)] px-5 py-3">
        <button type="button" onClick={closeVideoSettings} className={BTN_PRIMARY}>
          Done
        </button>
      </div>
    </Modal>
  );
}

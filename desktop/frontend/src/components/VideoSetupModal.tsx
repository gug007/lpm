import { BrowserOpenURL } from "../../bridge/runtime";
import { closeVideoSetup, installVideoSetup, useVideoSetup } from "../store/videoSetup";
import { videoSetupQueue, videoSetupRows } from "../videoSetup";
import { VideoIcon } from "./icons";
import { BTN_QUIET } from "./ui/buttons";
import { Modal } from "./ui/Modal";
import { VideoSetupRow } from "./VideoSetupRow";

const HOMEBREW_URL = "https://brew.sh";

const PRIMARY_BTN =
  "rounded-lg bg-[var(--accent-violet)] px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-default disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-violet)]/40";

// The first click on Video, where this Mac lacks something a video needs: every
// part, whether it's there, and one button that installs the rest. Closing it
// leaves an install running; Video turns on when it's done. Mounted once per
// window: the setup is the Mac's, not one terminal's.
export function VideoSetupModal() {
  const open = useVideoSetup((s) => s.open);
  const parts = useVideoSetup((s) => s.parts);
  const running = useVideoSetup((s) => s.running);
  const runs = useVideoSetup((s) => s.runs);
  const errors = useVideoSetup((s) => s.errors);
  if (!parts) return null;

  const rows = videoSetupRows(parts);
  const queue = videoSetupQueue(parts);
  const needsHomebrew = rows.some((p) => p.needsHomebrew);
  const failed = Object.keys(errors).length > 0;
  const label = running ? "Installing…" : failed ? "Try again" : "Install all";

  return (
    <Modal
      open={open}
      onClose={closeVideoSetup}
      zIndexClassName="z-[90]"
      backdropClassName="bg-black/50 backdrop-blur-sm"
      contentClassName="field-reveal w-[460px] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] shadow-2xl shadow-black/40"
    >
      <div className="flex items-start gap-3 px-5 pt-5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--accent-violet)]/15 text-[var(--accent-violet)] [&>svg]:h-[17px] [&>svg]:w-[17px]">
          <VideoIcon />
        </span>
        <div className="min-w-0 pt-0.5">
          <h3 className="text-[15px] font-semibold tracking-[-0.01em] text-[var(--text-primary)]">Set up video answers</h3>
          <p className="mt-0.5 text-[12px] leading-relaxed text-[var(--text-muted)]">
            A one-time setup on this Mac. After it, any prompt can come back as a narrated video.
          </p>
        </div>
      </div>
      <div className="px-5 pt-3">
        {rows.map((part) => (
          <VideoSetupRow key={part.id} part={part} run={runs[part.id]} error={errors[part.id]} />
        ))}
      </div>
      <div className="mt-3 flex items-center gap-2 border-t border-[var(--border)] px-5 py-3">
        {needsHomebrew ? (
          <button
            type="button"
            onClick={() => BrowserOpenURL(HOMEBREW_URL)}
            className="mr-auto text-left text-[11px] text-[var(--text-muted)] underline-offset-2 hover:text-[var(--text-primary)] hover:underline"
          >
            Install Homebrew from brew.sh, then try again
          </button>
        ) : (
          <span className="mr-auto text-[11px] text-[var(--text-muted)]">
            {running ? "You can close this; it keeps going." : "A few minutes · the voice runs on this Mac"}
          </span>
        )}
        <button type="button" onClick={closeVideoSetup} className={BTN_QUIET}>
          {running ? "Hide" : "Not now"}
        </button>
        <button
          type="button"
          onClick={() => void installVideoSetup()}
          disabled={running || queue.length === 0}
          className={PRIMARY_BTN}
        >
          {label}
        </button>
      </div>
    </Modal>
  );
}

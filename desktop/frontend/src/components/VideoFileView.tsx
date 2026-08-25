import type { VideoPreview } from "./videoPreview";

// max-h/max-w are explicit: the base stylesheet's `max-width: 100%` covers
// images only, so a 4K frame would otherwise overflow the modal.
const VIDEO_CLASS =
  "m-auto block max-h-full max-w-full rounded-md bg-black ring-1 ring-[var(--border)]";

interface VideoFileViewProps {
  video: VideoPreview;
}

export function VideoFileView({ video }: VideoFileViewProps) {
  return (
    <div className="flex h-full w-full overflow-hidden p-6">
      {video.error ? (
        <div className="m-auto max-w-md px-4 text-center">
          <div className="text-[13px] text-[var(--accent-red)]">{video.error}</div>
          <div className="mt-1 text-[12px] text-[var(--text-muted)]">
            Try opening it in another app.
          </div>
        </div>
      ) : !video.src ? (
        <div className="m-auto text-[13px] text-[var(--text-muted)]">Loading…</div>
      ) : (
        // No autoplay: the viewer opens from a click in terminal output, and
        // wry allows unattended playback, so it would fire audio unprompted.
        <video
          key={video.src}
          src={video.src}
          controls
          preload="metadata"
          onLoadedMetadata={video.onLoadedMetadata}
          onError={video.onError}
          className={VIDEO_CLASS}
        />
      )}
    </div>
  );
}

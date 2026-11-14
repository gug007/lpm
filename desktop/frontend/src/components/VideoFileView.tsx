import { PreviewStatus } from "./PreviewStatus";
import type { MediaPreview } from "./mediaPreview";

// max-h/max-w are explicit: the base stylesheet's `max-width: 100%` covers
// images only, so a 4K frame would otherwise overflow the modal.
const VIDEO_CLASS = "m-auto block max-h-full max-w-full bg-black";
const FRAMED = "rounded-md ring-1 ring-[var(--border)]";

interface VideoFileViewProps {
  video: MediaPreview;
  // A minimized viewer is sized to the video, so it fills it edge to edge.
  compact?: boolean;
}

export function VideoFileView({ video, compact = false }: VideoFileViewProps) {
  return (
    <div className={`flex h-full w-full overflow-hidden ${compact ? "bg-black" : "p-6"}`}>
      {video.error || !video.src ? (
        <PreviewStatus error={video.error} />
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
          className={`${VIDEO_CLASS} ${compact ? "" : FRAMED}`}
        />
      )}
    </div>
  );
}

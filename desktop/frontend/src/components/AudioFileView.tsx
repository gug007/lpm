import { AudioLines } from "lucide-react";
import { PreviewStatus } from "./PreviewStatus";
import type { MediaPreview } from "./mediaPreview";

interface AudioFileViewProps {
  audio: MediaPreview;
  // A minimized viewer is just the player.
  compact?: boolean;
}

export function AudioFileView({ audio, compact = false }: AudioFileViewProps) {
  if (audio.error || !audio.src) {
    return (
      <div className="flex h-full w-full">
        <PreviewStatus error={audio.error} />
      </div>
    );
  }
  // One tree for both sizes, so minimizing keeps the same element playing.
  return (
    <div className={`flex h-full w-full items-center justify-center ${compact ? "px-3" : "p-6"}`}>
      <div className="flex w-full max-w-[560px] flex-col items-center gap-6">
        {!compact && (
          <div className="flex size-24 items-center justify-center rounded-2xl bg-[var(--bg-secondary)] text-[var(--text-muted)] ring-1 ring-[var(--border)]">
            <AudioLines size={40} strokeWidth={1.5} />
          </div>
        )}
        {/* No autoplay, as with video: a click in terminal output opens this. */}
        <audio
          key={audio.src}
          src={audio.src}
          controls
          preload="metadata"
          onLoadedMetadata={audio.onLoadedMetadata}
          onError={audio.onError}
          className="block w-full"
        />
      </div>
    </div>
  );
}

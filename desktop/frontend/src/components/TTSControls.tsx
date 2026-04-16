import { useCallback, useRef } from "react";
import { useTTSStore } from "../store/tts";

export function TTSControls() {
  const status = useTTSStore((s) => s.status);
  const progress = useTTSStore((s) => s.progress);
  const duration = useTTSStore((s) => s.duration);
  const stopReading = useTTSStore((s) => s.stopReading);
  const seekBack = useTTSStore((s) => s.seekBack);
  const seekTo = useTTSStore((s) => s.seekTo);
  const togglePause = useTTSStore((s) => s.togglePause);

  const trackRef = useRef<HTMLDivElement>(null);

  const handleTrackClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const track = trackRef.current;
      if (!track || duration === 0) return;
      const rect = track.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      seekTo(ratio * duration);
    },
    [duration, seekTo],
  );

  if (status === "idle") return null;

  const isPlaying = status === "playing";
  const isLoading = status === "loading";
  const pct = Math.min(100, Math.max(0, progress));

  return (
    <div className="absolute bottom-8 left-1/2 z-10 -translate-x-1/2">
      <div className="flex w-96 items-center gap-1.5 rounded-full border border-white/[0.08] bg-black/70 px-1.5 py-1 shadow-2xl backdrop-blur-xl">
        <button
          onClick={() => seekBack(5)}
          disabled={isLoading}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-white/50 transition-colors hover:bg-white/10 hover:text-white/90 disabled:opacity-40"
        >
          <RewindIcon />
        </button>

        <button
          onClick={togglePause}
          disabled={isLoading}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/15 disabled:opacity-40"
        >
          {isLoading ? <Spinner /> : isPlaying ? <PauseIcon /> : <PlayIcon />}
        </button>

        <div
          ref={trackRef}
          onClick={handleTrackClick}
          className="group relative h-1 flex-1 cursor-pointer overflow-hidden rounded-full bg-white/10"
        >
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-white/60 transition-[width] duration-150"
            style={{ width: `${pct}%` }}
          />
          <div
            className="absolute top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full bg-white opacity-0 shadow transition-opacity group-hover:opacity-100"
            style={{ left: `calc(${pct}% - 5px)` }}
          />
        </div>

        <button
          onClick={stopReading}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-white/40 transition-colors hover:bg-white/10 hover:text-white/90"
        >
          <XIcon />
        </button>
      </div>
    </div>
  );
}

function RewindIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M2 12a10 10 0 1 1 3 7.2" strokeLinecap="round" />
      <path d="M2 16v-4h4" strokeLinecap="round" strokeLinejoin="round" />
      <text x="12" y="14.5" textAnchor="middle" fill="currentColor" stroke="none" fontSize="7.5" fontWeight="700" fontFamily="system-ui">5</text>
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="none">
      <path d="M6 4l14 8-14 8z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="none">
      <rect x="5" y="4" width="5" height="16" rx="1" />
      <rect x="14" y="4" width="5" height="16" rx="1" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function Spinner() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="animate-spin">
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}

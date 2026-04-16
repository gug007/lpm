import { useTTSStore } from "../store/tts";

export function TTSControls() {
  const status = useTTSStore((s) => s.status);
  const text = useTTSStore((s) => s.text);
  const progress = useTTSStore((s) => s.progress);
  const stopReading = useTTSStore((s) => s.stopReading);
  const togglePause = useTTSStore((s) => s.togglePause);

  if (status === "idle") return null;

  const isPlaying = status === "playing";
  const truncated = text.length > 40 ? text.slice(0, 40) + "..." : text;

  return (
    <div className="absolute bottom-[100px] left-1/2 z-10 flex h-8 -translate-x-1/2 items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-active)] px-3 shadow-lg backdrop-blur">
      <SpeakerIcon animate={isPlaying} />

      <button
        onClick={togglePause}
        disabled={status === "loading"}
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-[var(--text-primary)] transition-colors hover:bg-[var(--border)] disabled:opacity-50"
        title={isPlaying ? "Pause" : "Play"}
      >
        {isPlaying ? <PauseIcon /> : <PlayIcon />}
      </button>

      <button
        onClick={stopReading}
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-[var(--text-primary)] transition-colors hover:bg-[var(--border)]"
        title="Stop"
      >
        <StopIcon />
      </button>

      <div className="relative mx-1 h-1 min-w-[60px] flex-1 overflow-hidden rounded-full bg-[var(--border)]">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-[var(--accent-green)] transition-[width] duration-200"
          style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
        />
      </div>

      <span className="shrink-0 truncate text-[11px] text-[var(--text-muted)]" style={{ maxWidth: "40ch" }}>
        {truncated}
      </span>
    </div>
  );
}

function SpeakerIcon({ animate }: { animate: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 text-[var(--text-muted)] ${animate ? "animate-pulse" : ""}`}
    >
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" stroke="none">
      <polygon points="5 3 19 12 5 21 5 3" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" stroke="none">
      <rect x="4" y="3" width="6" height="18" rx="1" />
      <rect x="14" y="3" width="6" height="18" rx="1" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" stroke="none">
      <rect x="3" y="3" width="18" height="18" rx="2" />
    </svg>
  );
}

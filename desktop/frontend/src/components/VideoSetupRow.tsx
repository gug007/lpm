import { Film, Globe, Hammer, Hexagon, Loader2, Mic, Puzzle, type LucideIcon } from "lucide-react";
import {
  VIDEO_SETUP_INFO,
  videoSetupAbout,
  videoSetupStatus,
  type VideoSetupPart,
  type VideoSetupPartId,
  type VideoSetupRun,
  type VideoSetupTone,
} from "../videoSetup";

const ICON: Record<VideoSetupPartId, LucideIcon> = {
  skill: Puzzle,
  node: Hexagon,
  ffmpeg: Film,
  xcodeTools: Hammer,
  chromium: Globe,
  voice: Mic,
};

const TONE: Record<VideoSetupTone, string> = {
  ok: "bg-[var(--accent-green)]/12 text-[var(--accent-green-text)]",
  add: "bg-[var(--accent-violet)]/14 text-[var(--accent-violet-text)]",
  you: "bg-[var(--accent-amber)]/14 text-[var(--accent-amber-text)]",
  run: "bg-[var(--bg-active)] text-[var(--text-secondary)]",
  bad: "bg-[var(--accent-red)]/12 text-[var(--accent-red-text)]",
};

// One part in the setup window: what it is, what it's for, and where it stands.
export function VideoSetupRow({ part, run, error }: { part: VideoSetupPart; run?: VideoSetupRun; error?: string }) {
  const Icon = ICON[part.id];
  const info = VIDEO_SETUP_INFO[part.id];
  const status = videoSetupStatus(part, run);
  return (
    <div className="flex items-center gap-3 border-b border-[var(--border)] py-2 last:border-b-0">
      <span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-md bg-[var(--bg-secondary)] text-[var(--text-secondary)]">
        <Icon size={13} strokeWidth={1.75} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[12.5px] text-[var(--text-primary)]">{info.name}</div>
        <div className={`text-[11px] leading-snug ${error ? "text-[var(--accent-red-text)]" : "text-[var(--text-muted)]"}`}>
          {error ?? videoSetupAbout(part)}
        </div>
      </div>
      <span
        className={`flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 py-1 text-[10.5px] font-medium leading-none ${TONE[status.tone]}`}
      >
        {run === "installing" && <Loader2 size={10} className="animate-spin" />}
        {status.label}
      </span>
    </div>
  );
}

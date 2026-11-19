// The parts a Mac needs before the Video button's first video, as the setup
// window lists them: what each is for, and how its row reads.

// In the order video_setup_check reports them, which is install order: each
// part's prerequisites first, and Apple's installer, which waits on the person,
// after the downloads.
export const VIDEO_SETUP_PARTS = ["skill", "node", "ffmpeg", "chromium", "voice", "xcodeTools"] as const;
export type VideoSetupPartId = (typeof VIDEO_SETUP_PARTS)[number];

// One part as video_setup_check reports it.
export interface VideoSetupPart {
  id: VideoSetupPartId;
  ready: boolean;
  // Missing, and lpm can't install it until Homebrew is there.
  needsHomebrew: boolean;
  // The agent CLI still without a part another agent CLI already has.
  shareWith?: string | null;
}

export type VideoSetupRun = "installing" | "done" | "failed";

export type VideoSetupTone = "ok" | "add" | "you" | "run" | "bad";

interface PartInfo {
  name: string;
  about: string;
  // How a missing part's row reads before Install all.
  missing: string;
}

export const VIDEO_SETUP_INFO: Record<VideoSetupPartId, PartInfo> = {
  skill: { name: "explaincast skill", about: "Writes and records the video · from GitHub", missing: "Will add" },
  node: { name: "Node.js", about: "Runs explaincast · from Homebrew", missing: "Will add" },
  ffmpeg: { name: "ffmpeg", about: "Turns the recording into an MP4 · from Homebrew", missing: "Will add" },
  xcodeTools: { name: "Xcode Command Line Tools", about: "Reads the screen to check each take", missing: "Apple's installer" },
  chromium: { name: "Chromium", about: "Records web pages without touching your screen", missing: "Will add" },
  voice: { name: "Local voice", about: "Speaks the narration on this Mac · English", missing: "About 1 GB" },
};

export function isVideoSetUp(parts: readonly VideoSetupPart[]): boolean {
  return parts.every((p) => p.ready);
}

// The rows the window shows, in install order. Node.js is a row only when it's
// missing: most Macs that run an agent CLI already have it.
export function videoSetupRows(parts: readonly VideoSetupPart[]): VideoSetupPart[] {
  return parts.filter((p) => p.id !== "node" || !p.ready);
}

// What Install all works through: the missing parts lpm can install.
export function videoSetupQueue(parts: readonly VideoSetupPart[]): VideoSetupPartId[] {
  return videoSetupRows(parts)
    .filter((p) => !p.ready && !p.needsHomebrew)
    .map((p) => p.id);
}

// The row's second line: what the part is for, what it's waiting on, or who
// already has it.
export function videoSetupAbout(part: VideoSetupPart): string {
  if (part.needsHomebrew) return "Needs Homebrew first, from brew.sh";
  if (part.ready || !part.shareWith) return VIDEO_SETUP_INFO[part.id].about;
  return `Already installed for ${part.shareWith === "Codex" ? "Claude Code" : "Codex"}`;
}

export function videoSetupStatus(part: VideoSetupPart, run?: VideoSetupRun): { label: string; tone: VideoSetupTone } {
  if (run === "installing") {
    return part.id === "xcodeTools"
      ? { label: "Waiting for Apple's installer", tone: "you" }
      : { label: "Installing…", tone: "run" };
  }
  if (run === "failed") return { label: "Didn't install", tone: "bad" };
  if (run === "done" || part.ready) return { label: "Installed", tone: "ok" };
  if (part.needsHomebrew) return { label: "Needs Homebrew", tone: "you" };
  if (part.shareWith) return { label: `Add to ${part.shareWith}`, tone: "add" };
  return { label: VIDEO_SETUP_INFO[part.id].missing, tone: part.id === "xcodeTools" ? "you" : "add" };
}

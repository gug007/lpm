import { create } from "zustand";
import { VideoSetupCheck, VideoSetupInstall } from "../../bridge/commands";
import { toast } from "../notifications/toast";
import {
  isVideoSetUp,
  videoSetupQueue,
  VIDEO_SETUP_INFO,
  type VideoSetupPart,
  type VideoSetupPartId,
  type VideoSetupRun,
} from "../videoSetup";
import { useVideoAnswer } from "./videoAnswer";

// The one-time setup the Video button asks for on its first click. It lives
// outside the window so an install keeps going, and still turns Video on, after
// the window is closed.
interface VideoSetupStore {
  // What the last check found.
  parts: VideoSetupPart[] | null;
  open: boolean;
  // The terminal whose Video click asked for the setup: it gets Video turned on
  // when the install finishes.
  turnOnFor: string | null;
  running: boolean;
  runs: Partial<Record<VideoSetupPartId, VideoSetupRun>>;
  errors: Partial<Record<VideoSetupPartId, string>>;
}

export const useVideoSetup = create<VideoSetupStore>(() => ({
  parts: null,
  open: false,
  turnOnFor: null,
  running: false,
  runs: {},
  errors: {},
}));

/** True when video can be made now; otherwise opens the setup window for
 *  `terminalId` and resolves false. */
export async function ensureVideoReady(terminalId: string): Promise<boolean> {
  const { parts: known, running } = useVideoSetup.getState();
  // Everything was there at the last check: later clicks skip checking.
  if (known && isVideoSetUp(known)) return true;
  if (running) {
    useVideoSetup.setState({ open: true, turnOnFor: terminalId });
    return false;
  }
  let parts: VideoSetupPart[];
  try {
    parts = (await VideoSetupCheck()) as VideoSetupPart[];
  } catch {
    // A Mac that can't be checked still lets the skill report what it lacks.
    return true;
  }
  if (isVideoSetUp(parts)) {
    useVideoSetup.setState({ parts });
    return true;
  }
  useVideoSetup.setState({ parts, open: true, turnOnFor: terminalId, runs: {}, errors: {} });
  return false;
}

export function closeVideoSetup(): void {
  useVideoSetup.setState({ open: false });
}

// Installs each missing part in turn. A part that fails doesn't stop the rest:
// each one checks its own prerequisites and says which it's missing.
export async function installVideoSetup(): Promise<void> {
  const { parts, running } = useVideoSetup.getState();
  if (!parts || running) return;
  useVideoSetup.setState({ running: true, runs: {}, errors: {} });
  const mark = (id: VideoSetupPartId, run: VideoSetupRun, error?: string) =>
    useVideoSetup.setState((s) => ({
      runs: { ...s.runs, [id]: run },
      errors: error ? { ...s.errors, [id]: error } : s.errors,
    }));
  for (const id of videoSetupQueue(parts)) {
    mark(id, "installing");
    try {
      await VideoSetupInstall(id);
      mark(id, "done");
    } catch (err) {
      mark(id, "failed", String(err));
    }
  }
  let fresh = parts;
  try {
    fresh = (await VideoSetupCheck()) as VideoSetupPart[];
  } catch {
    // Keep the rows as they ran.
  }
  const { open, turnOnFor, errors } = useVideoSetup.getState();
  useVideoSetup.setState({ parts: fresh, running: false });
  if (isVideoSetUp(fresh)) {
    if (turnOnFor) useVideoAnswer.getState().setOn(turnOnFor, true);
    useVideoSetup.setState({ open: false, turnOnFor: null, runs: {}, errors: {} });
    toast.success("Video is ready", { description: "Your next prompt comes back as a narrated video." });
    return;
  }
  if (open) return;
  const failed = Object.keys(errors) as VideoSetupPartId[];
  toast.error("Video setup didn't finish", {
    description: failed.length ? `${failed.map((id) => VIDEO_SETUP_INFO[id].name).join(", ")} didn't install.` : undefined,
    action: { label: "Open", onClick: () => useVideoSetup.setState({ open: true }) },
  });
}

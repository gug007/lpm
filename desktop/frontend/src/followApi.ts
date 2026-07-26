import * as commands from "../bridge/commands";

// A local project kept in step with another Mac. `paused` means syncing stopped
// and needs an answer; `lastError` is a fault expected to clear on its own.
export interface FollowState {
  project: string;
  slug: string;
  sourceRoot: string;
  paused?: string;
  // A pause the user asked for resumes as-is; one the engine set because their
  // work is in the way needs them to say what happens to that work.
  pausedByUser?: boolean;
  lastError?: string;
  lastBranch?: string;
  lastSyncedAt: number;
  files: number;
  syncing: boolean;
}

export interface FollowPaused {
  project: string;
  reason: string;
}

// Same presence check as the one-shot transfer: an app shell built before these
// commands existed still loads this UI, and gets a hidden control rather than a
// crash.
const bridge = commands as unknown as Partial<{
  FollowList(): Promise<FollowState[]>;
  FollowStop(project: string): Promise<void>;
  FollowPause(project: string): Promise<void>;
  FollowResume(project: string, discardLocal: boolean): Promise<void>;
}>;

const UNSUPPORTED = "Following a Mac isn't available in this version of lpm";

export function followSupported(): boolean {
  return typeof bridge.FollowStop === "function";
}

export async function followList(): Promise<FollowState[]> {
  if (!bridge.FollowList) return [];
  return (await bridge.FollowList()) ?? [];
}

export async function followPause(project: string): Promise<void> {
  if (!bridge.FollowPause) throw new Error(UNSUPPORTED);
  await bridge.FollowPause(project);
}

export async function followStop(project: string): Promise<void> {
  if (!bridge.FollowStop) throw new Error(UNSUPPORTED);
  await bridge.FollowStop(project);
}

export async function followResume(
  project: string,
  discardLocal: boolean,
): Promise<void> {
  if (!bridge.FollowResume) throw new Error(UNSUPPORTED);
  await bridge.FollowResume(project, discardLocal);
}

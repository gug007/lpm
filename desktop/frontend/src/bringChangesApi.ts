import * as commands from "../bridge/commands";

export type BringMode = "current" | "existing" | "new";

export type BringPhase =
  | "preparing"
  | "transferring"
  | "indexing"
  | "duplicating"
  | "applying";

// A place the work can land: the project itself (always first) followed by its
// duplicates. `dirty` or `!isRepo` means it can be listed but not chosen.
export interface BringTarget {
  name: string;
  root: string;
  worktree: boolean;
  isRepo: boolean;
  dirty: boolean;
}

export interface BringChangesRequest {
  sourceSlug: string;
  // Host-native absolute path on the source Mac (no /@peer- marker).
  sourceRoot: string;
  project: string;
  mode: BringMode;
  // Local project name when mode is "existing".
  target?: string;
  // Display label for the copy when mode is "new".
  label?: string;
}

export interface BringProgress {
  id: string;
  phase: BringPhase;
  received: number;
  total: number;
  message?: string;
}

export interface BringDone {
  id: string;
  ok: boolean;
  error?: string;
  project?: string;
  branch?: string;
  changed?: number;
}

// The command bindings are hand-maintained alongside the Rust side, so an app
// shell built before they existed can still load this UI. Routing every call
// through a presence check turns that into a disabled menu entry and a clear
// message instead of a crash.
const bridge = commands as unknown as Partial<{
  BringChangesTargets(project: string): Promise<BringTarget[]>;
  BringChangesStart(opts: BringChangesRequest): Promise<string>;
  BringChangesCancel(id: string): Promise<void>;
}>;

const UNSUPPORTED = "Bring changes isn't available in this version of lpm";

export function bringChangesSupported(): boolean {
  return typeof bridge.BringChangesStart === "function";
}

export async function bringChangesTargets(
  project: string,
): Promise<BringTarget[]> {
  if (!bridge.BringChangesTargets) throw new Error(UNSUPPORTED);
  return (await bridge.BringChangesTargets(project)) ?? [];
}

export async function bringChangesStart(
  opts: BringChangesRequest,
): Promise<string> {
  if (!bridge.BringChangesStart) throw new Error(UNSUPPORTED);
  return bridge.BringChangesStart(opts);
}

export async function bringChangesCancel(id: string): Promise<void> {
  await bridge.BringChangesCancel?.(id);
}

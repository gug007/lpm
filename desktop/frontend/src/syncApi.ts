import * as commands from "../bridge/commands";

// Setting a folder up runs through these phases; every one but "creating" is the
// transfer itself, which is also what later syncs do.
export type SyncPhase = "creating" | "preparing" | "transferring" | "indexing" | "applying";

export interface SyncProgress {
  id: string;
  phase: SyncPhase;
  received: number;
  total: number;
  message?: string;
}

export interface SyncDone {
  id: string;
  ok: boolean;
  // Absent when the user cancelled — that is not a failure to report.
  error?: string;
  project?: string;
  branch?: string;
  changed?: number;
}

// Presence check so an app shell built before these commands existed still loads
// this UI, and gets a hidden menu item rather than a crash.
const bridge = commands as unknown as Partial<{
  SyncProjectStart(slug: string, sourceRoot: string, remoteName: string): Promise<string>;
  SyncProjectCancel(id: string): Promise<void>;
}>;

const UNSUPPORTED = "Syncing a folder isn't available in this version of lpm";

export function syncSupported(): boolean {
  return typeof bridge.SyncProjectStart === "function";
}

/// Returns the run id that `sync-progress` and `sync-done` events carry.
export async function syncProjectStart(
  slug: string,
  sourceRoot: string,
  remoteName: string,
): Promise<string> {
  if (!bridge.SyncProjectStart) throw new Error(UNSUPPORTED);
  return bridge.SyncProjectStart(slug, sourceRoot, remoteName);
}

export async function syncProjectCancel(id: string): Promise<void> {
  await bridge.SyncProjectCancel?.(id);
}

const UNITS = ["B", "KB", "MB", "GB"];

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const rounded =
    unit === 0 || value >= 10
      ? String(Math.round(value))
      : value.toFixed(1).replace(/\.0$/, "");
  return `${rounded} ${UNITS[unit]}`;
}

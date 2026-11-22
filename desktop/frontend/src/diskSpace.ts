import { folderBytes, sumByKind, type RebuildableFolder } from "./projectArchive";
import { formatBytes } from "./syncApi";

export interface DiskSpace {
  free: number;
  total: number;
  // A copy made there shares its unchanged files with the original (APFS).
  clones: boolean;
}

export interface DuplicateSpaceInfo extends DiskSpace {
  // Each copy's size; null when copies share their files until they change.
  bytes: number | null;
}

export interface CopySpaceInfo {
  // What the copy holds of its own.
  bytes: number;
  // What comes back by itself: dependencies, Cargo's target, framework caches.
  freeable: RebuildableFolder[];
  running: boolean;
}

// Below this share of the disk free, the space is called low.
export const LOW_SHARE = 0.1;

/** Whether `need` more bytes would leave the disk low, or not fit at all. */
export function isLow(disk: DiskSpace, need = 0): boolean {
  return disk.total > 0 && disk.free - need < disk.total * LOW_SHARE;
}

export function freeableBytes(space: CopySpaceInfo | null | undefined): number {
  return folderBytes(space?.freeable);
}

/** The kinds of folder that go, by name, biggest first: node_modules, .next… */
export function folderKinds(spaces: (CopySpaceInfo | null | undefined)[]): string[] {
  return sumByKind(spaces.map((space) => space?.freeable)).map((kind) => kind.path);
}

export function parseDiskSpace(value: unknown): DiskSpace | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Partial<DiskSpace>;
  if (typeof v.free !== "number" || typeof v.total !== "number") return null;
  return { free: v.free, total: v.total, clones: v.clones === true };
}

/** "41 GB free of 250 GB", or the warning when it's low. */
export function diskSummary(disk: DiskSpace): string {
  const free = `${formatBytes(disk.free)} free of ${formatBytes(disk.total)}`;
  return isLow(disk) ? `Low on space: ${free}` : free;
}

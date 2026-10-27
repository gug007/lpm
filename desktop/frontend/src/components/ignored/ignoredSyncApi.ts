import { EventsOnReady } from "../../../bridge/runtime";
import {
  IgnoredSyncCancel,
  IgnoredSyncForget,
  IgnoredSyncList,
  IgnoredSyncRead,
  IgnoredSyncSave,
  IgnoredSyncSaved,
  IgnoredSyncSet,
  IgnoredSyncStart,
  IgnoredSyncUndo,
} from "../../../bridge/commands";

// One project as this computer and another hold it: the local one by name, the
// other by which computer and where its folder is there.
export interface SyncPair {
  project: string;
  slug: string;
  remoteRoot: string;
  machine: string;
}

export interface IgnoredEntry {
  // Project-relative; a folder's ends in "/".
  path: string;
  dir: boolean;
  size: number;
  files: number;
  mtime: number;
  digest: string;
}

export interface IgnoredListing {
  entries: IgnoredEntry[];
  more: number;
  // The project's git `origin`, on the listing of its ignored entries.
  origin?: string;
  error?: string;
}

// This computer's listing and each other computer's, by its slug.
export interface Listings {
  here: IgnoredListing;
  there: Record<string, IgnoredListing>;
  // False for a computer whose folder holds a different repository.
  sameRepo: Record<string, boolean>;
}

export type Direction = "pull" | "push";

// Which version a sync keeps where the computers differ now: the newest, this
// computer's, or another computer's by its slug.
export type Prefer = "newest" | "here" | (string & {});

export interface LandedBatch {
  batch: string;
  // Where it landed when not on this computer.
  slug?: string;
  remoteRoot?: string;
}

export interface SyncProgress {
  id: string;
  phase: "comparing" | "copying";
  // The computer files are being copied with, when several are synced.
  machine?: string;
  sent?: number;
  total?: number;
  files?: number;
  totalFiles?: number;
}

export interface SyncDone {
  id: string;
  ok: boolean;
  error?: string | null;
  cancelled?: boolean;
  // A one-time copy's batch; a sync's, one per direction, are in `batches`.
  batch?: string;
  batches?: LandedBatch[];
  sent?: number;
  // What each computer got, when several are synced.
  sentTo?: { machine: string; files: number }[];
  received?: number;
  files?: number;
  bytes?: number;
  added?: number;
  replaced?: number;
  unchanged?: boolean;
}

export interface SavedList {
  paths: string[];
  keep: boolean;
  // Files the last round found changed on both computers.
  conflicts: string[];
}

export interface Undone {
  restored: number;
  // Keeping those files in step stopped, so the undo isn't copied over.
  paused: boolean;
}

const EMPTY: IgnoredListing = { entries: [], more: 0 };

function listing(value: unknown): IgnoredListing {
  const v = value as Partial<IgnoredListing> | undefined;
  return { ...EMPTY, ...v, entries: v?.entries ?? [] };
}

const targetsOf = (pairs: SyncPair[]) => pairs.map((p) => ({ slug: p.slug, remoteRoot: p.remoteRoot }));

export async function listIgnored(project: string, pairs: SyncPair[], dir: string): Promise<Listings> {
  const res = (await IgnoredSyncList(project, targetsOf(pairs), dir)) as Partial<Listings> | undefined;
  const there = Object.fromEntries(pairs.map((p) => [p.slug, listing(res?.there?.[p.slug])]));
  return { here: listing(res?.here), there, sameRepo: res?.sameRepo ?? {} };
}

export interface RunWatch {
  onProgress?: (p: SyncProgress) => void;
  onDone: (d: SyncDone) => void;
}

/// Start run `id` with `begin`, listening first so none of its events can be
/// missed. Answers how to stop listening early.
async function watchRun(id: string, begin: () => Promise<unknown>, watch: RunWatch): Promise<() => void> {
  const offs: Array<() => void> = [];
  const off = () => offs.splice(0).forEach((f) => f());
  offs.push(
    await EventsOnReady("ignored-sync-progress", (p: SyncProgress) => {
      if (p?.id === id) watch.onProgress?.(p);
    }),
    await EventsOnReady("ignored-sync-done", (d: SyncDone) => {
      if (d?.id !== id) return;
      off();
      watch.onDone(d);
    }),
  );
  try {
    await begin();
  } catch (err) {
    off();
    throw err;
  }
  return off;
}

/// Copy `paths` once, one way.
export function copyPaths(id: string, pair: SyncPair, direction: Direction, paths: string[], watch: RunWatch) {
  return watchRun(id, () => IgnoredSyncStart(id, pair.project, pair.slug, pair.remoteRoot, direction, paths), watch);
}

/// Keep `paths` in sync with every one of `pairs`' computers, bringing them in
/// step now.
export function syncPaths(
  id: string,
  project: string,
  pairs: SyncPair[],
  paths: string[],
  prefer: Prefer,
  watch: RunWatch,
) {
  return watchRun(id, () => IgnoredSyncSet(id, project, targetsOf(pairs), paths, prefer), watch);
}

export function cancelSync(id: string): Promise<void> {
  return IgnoredSyncCancel(id);
}

export function undoSync(project: string, batches: LandedBatch[]): Promise<Undone> {
  return IgnoredSyncUndo(project, batches);
}

export interface Texts {
  here: string | null;
  there: Record<string, string | null>;
}

/// A small text file as this computer and each of `pairs`' computers hold it.
export async function readAll(project: string, pairs: SyncPair[], path: string): Promise<Texts> {
  const res = (await IgnoredSyncRead(project, targetsOf(pairs), path)) as Partial<Texts> | undefined;
  return { here: res?.here ?? null, there: Object.fromEntries(pairs.map((p) => [p.slug, res?.there?.[p.slug] ?? null])) };
}

export async function savedList(pair: SyncPair): Promise<SavedList | null> {
  return ((await IgnoredSyncSaved(pair.project, pair.slug)) as SavedList | null) ?? null;
}

export function saveList(pair: SyncPair, paths: string[], keep: boolean): Promise<void> {
  return IgnoredSyncSave(pair.project, pair.slug, pair.remoteRoot, paths, keep);
}

export function forgetList(pair: SyncPair): Promise<void> {
  return IgnoredSyncForget(pair.project, pair.slug);
}

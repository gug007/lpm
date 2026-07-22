// Pure decision for what (if anything) an auto-sync run should tell the user.
//
// Auto-sync runs unattended, so the only runs worth interrupting for are the two
// that need a human to know: a both-sides change (resolved automatically, backup
// kept) and a failure. Clean runs — the vast majority, including the empty no-ops
// after applying a remote change and the periodic anti-entropy passes — say
// nothing. Errors are throttled per peer so a persistently failing peer can't spam
// a toast every run; conflicts are rare (a conflict resolves once, then the pair
// converges) so they always surface.

export interface AutoSyncResult {
  slug: string;
  applied: number;
  pushed: number;
  errors: string[];
  conflicts: string[];
}

export type AutoSyncToast =
  | { kind: "conflict"; message: string }
  | { kind: "error"; message: string }
  | null;

/// Minimum gap between error toasts for one peer.
export const ERROR_TOAST_GAP_MS = 3 * 60_000;

function conflictMessage(conflicts: string[]): string {
  if (conflicts.length === 1) {
    return `'${conflicts[0]}' changed on both Macs — kept the newer change. Backup saved.`;
  }
  return `${conflicts.length} items changed on both Macs — kept the newer changes. Backup saved.`;
}

function errorMessage(peerName: string): string {
  return `Couldn't finish syncing with ${peerName}. It'll keep trying.`;
}

/// The toast (if any) for one auto-sync result. A run that errored surfaces the
/// error (throttled via `lastErrorAt`, the last time an error toast was shown for
/// this peer); otherwise a run that resolved a conflict surfaces that; a clean run
/// produces nothing. Pure — the caller records `now` as the new `lastErrorAt`
/// whenever this returns an `error` toast.
export function autoSyncToast(
  result: AutoSyncResult,
  peerName: string,
  lastErrorAt: number | undefined,
  now: number,
  gapMs: number = ERROR_TOAST_GAP_MS,
): AutoSyncToast {
  const errors = result.errors?.length ?? 0;
  const conflicts = result.conflicts ?? [];
  if (errors > 0) {
    if (lastErrorAt !== undefined && now - lastErrorAt < gapMs) return null;
    return { kind: "error", message: errorMessage(peerName) };
  }
  if (conflicts.length > 0) {
    return { kind: "conflict", message: conflictMessage(conflicts) };
  }
  return null;
}

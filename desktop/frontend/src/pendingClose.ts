import { type TerminalInstance } from "./paneTree";

// A tab whose close is being held open behind an "Undo" toast: its PTY and
// xterm buffer stay alive for the grace period, but the tab is already out of
// the tree. Module-level (like the xterm session cache) so TerminalView's
// disposal effect can check membership without prop threading.
export interface PendingClose {
  tab: TerminalInstance;
  paneId: string;
  tabIdx: number;
  projectName: string;
  toastId: string;
  finalized: boolean;
}

const pending = new Map<string, PendingClose>();

export function registerPendingClose(entry: PendingClose): void {
  pending.set(entry.tab.id, entry);
}

export function isPendingClose(id: string): boolean {
  return pending.has(id);
}

// Remove and return the entry, so the caller (undo or finalize) atomically
// claims it — a second caller gets undefined and no-ops.
export function takePendingClose(id: string): PendingClose | undefined {
  const entry = pending.get(id);
  if (entry) pending.delete(id);
  return entry;
}

export function pendingClosesForProject(projectName: string): PendingClose[] {
  return [...pending.values()].filter((e) => e.projectName === projectName);
}

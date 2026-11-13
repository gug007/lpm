import { type PaneLeaf, type TerminalInstance } from "./paneTree";
import { type PaneSpot } from "./paneSpot";

// Grace period a closed tab or pane stays recoverable behind the undo toast.
export const UNDO_CLOSE_DURATION_MS = 5000;
// Unsaved edits can't be had back from anywhere else, so their undo stays up longer.
export const UNSAVED_CLOSE_DURATION_MS = 15000;

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

// A whole pane held open behind one toast. Each of its tabs is registered as a
// PendingClose too, so every membership check sees them; this keeps the pane
// itself and where it sat, for undo to put it back.
export interface PendingPaneClose {
  pane: PaneLeaf;
  spot: PaneSpot | null;
  projectName: string;
  toastId: string;
}

const pending = new Map<string, PendingClose>();
const pendingPanes = new Map<string, PendingPaneClose>();

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

export function registerPendingPaneClose(entry: PendingPaneClose): void {
  pendingPanes.set(entry.pane.id, entry);
  entry.pane.tabs.forEach((tab, tabIdx) =>
    registerPendingClose({
      tab,
      paneId: entry.pane.id,
      tabIdx,
      projectName: entry.projectName,
      toastId: entry.toastId,
      finalized: false,
    }),
  );
}

// Claims the pane together with its tabs, the same way takePendingClose does.
export function takePendingPaneClose(paneId: string): PendingPaneClose | undefined {
  const entry = pendingPanes.get(paneId);
  if (!entry) return undefined;
  pendingPanes.delete(paneId);
  for (const tab of entry.pane.tabs) takePendingClose(tab.id);
  return entry;
}

export function pendingPaneClosesForProject(projectName: string): PendingPaneClose[] {
  return [...pendingPanes.values()].filter((e) => e.projectName === projectName);
}

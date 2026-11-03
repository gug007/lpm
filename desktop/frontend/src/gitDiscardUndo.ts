import { GitRestoreDiscarded } from "../bridge/commands";
import { toast } from "./notifications/toast";

export const DISCARD_KEPT_TEXT = "lpm keeps a copy for 7 days: Undo it from the toast or from Git › History.";

const UNDO_TOAST_MS = 10_000;

/** A discarded copy as git_discarded lists it. */
export interface DiscardedCopy {
  id: string;
  at: number;
  files: string[];
}

export async function restoreDiscarded(cwd: string, id: string, onRestored?: () => void): Promise<boolean> {
  try {
    await GitRestoreDiscarded(cwd, id);
    toast.success("Restored the discarded changes");
    return true;
  } catch (err: unknown) {
    toast.error(`Couldn't restore: ${String(err)}`);
    return false;
  } finally {
    onRestored?.();
  }
}

/** The success toast after a discard, with Undo when a copy was kept. */
export function announceDiscard(cwd: string, id: unknown, title: string, onRestored?: () => void): void {
  if (typeof id !== "string" || !id) {
    toast.success(title);
    return;
  }
  toast.success(title, {
    duration: UNDO_TOAST_MS,
    action: { label: "Undo", onClick: () => void restoreDiscarded(cwd, id, onRestored) },
  });
}

// Arrow Up/Down walk through a terminal's sent-message ring. The cursor sits at
// -1 while the live draft is in the field and at 0..n-1 (newest first) while a
// recalled message is. Stepping off the live draft parks it in the stash so
// stepping back down restores what was being typed rather than emptying the
// field — the field is the draft's only copy, and recall overwrites it.

import type { ComposerHistoryEntry } from "../store/composerDrafts";

export interface RecallCursor {
  index: number;
  stash: ComposerHistoryEntry | null;
}

export interface RecallStep extends RecallCursor {
  entry: ComposerHistoryEntry; // what the field should hold after the step
}

const EMPTY: ComposerHistoryEntry = { text: "", images: {} };

// One step through the ring, or null when the step is a no-op (no history yet,
// or already at the oldest message / the live draft). `live` is the field's
// current content, parked only when the cursor leaves the live draft.
export function stepRecall(
  cursor: RecallCursor,
  delta: 1 | -1,
  history: ComposerHistoryEntry[],
  live: ComposerHistoryEntry,
): RecallStep | null {
  if (history.length === 0) return null;
  const index = Math.min(history.length - 1, Math.max(-1, cursor.index + delta));
  if (index === cursor.index) return null;
  const stash = cursor.index === -1 ? live : cursor.stash;
  if (index !== -1) return { index, stash, entry: history[index] };
  return { index, stash: null, entry: stash ?? EMPTY };
}

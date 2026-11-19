import { toast } from "../../notifications/toast";
import { RevealInFinder, SetClipboardText } from "../../../bridge/commands";
import { stripMarker } from "../../peer/markers";
import { chordLabel, type Chord } from "../../keys";

// Move to Trash on the tree cursor, as in Finder.
export const TRASH_CHORD: Chord = { key: "Backspace", meta: true };

// The row menu's actions that are reachable from the keyboard: the path ones
// on the open file or the tree cursor, Move to Trash on the cursor.
export const FILE_CHORDS = {
  reveal: chordLabel({ key: "r", meta: true, alt: true }),
  copyPath: chordLabel({ key: "c", meta: true, alt: true }),
  copyRelativePath: chordLabel({ key: "c", meta: true, alt: true, shift: true }),
  trash: chordLabel(TRASH_CHORD),
} as const;

export async function copyText(text: string, done = "Copied"): Promise<void> {
  try {
    await SetClipboardText(text);
    toast.success(done);
  } catch (err: unknown) {
    toast.error(String(err));
  }
}

export function copyAbsolutePath(absPath: string): Promise<void> {
  return copyText(stripMarker(absPath));
}

export async function revealInFinder(absPath: string): Promise<void> {
  try {
    await RevealInFinder(absPath);
  } catch (err: unknown) {
    toast.error(String(err));
  }
}

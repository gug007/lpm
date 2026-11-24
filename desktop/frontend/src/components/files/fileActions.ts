import { toast } from "../../notifications/toast";
import { RevealInFinder, SetClipboardText } from "../../../bridge/commands";
import { stripMarker } from "../../peer/markers";
import { chordLabel, type Chord } from "../../keys";
import { revealLabel } from "../../machineWords";

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

// `onHost`: the path is an SSH host's, where this computer may have another file.
export async function revealInFinder(absPath: string, onHost = false): Promise<void> {
  if (onHost) {
    toast.error(`${revealLabel()} works only for files on this computer`);
    return;
  }
  try {
    await RevealInFinder(absPath);
  } catch (err: unknown) {
    toast.error(String(err));
  }
}

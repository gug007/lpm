import { toast } from "sonner";
import { RevealInFinder, SetClipboardText } from "../../../bridge/commands";
import { stripMarker } from "../../peer/markers";

// The same three actions the row menu offers, reachable from the keyboard on
// the open file or the tree cursor.
export const FILE_CHORDS = {
  reveal: "⌘⌥R",
  copyPath: "⌘⌥C",
  copyRelativePath: "⌘⌥⇧C",
} as const;

export async function copyText(text: string): Promise<void> {
  try {
    await SetClipboardText(text);
    toast.success("Copied");
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

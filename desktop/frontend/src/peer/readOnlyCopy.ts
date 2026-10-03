import { toast } from "sonner";
import { isSourceImage, mediaKind } from "../components/fileMedia";
import { basename } from "../path";

// What opening a paired machine's file answers with: whether the app got a
// read-only copy rather than the file itself, and which machine has the file.
export interface PeerOpened {
  copy: boolean;
  host: string;
}

// Pictures, videos and PDFs are only looked at, so a copy serves them as well
// as the original. Anything else, an SVG too, may be edited.
export function isEditable(absPath: string): boolean {
  return mediaKind(absPath) === null || isSourceImage(absPath);
}

// Saving into a copy would go nowhere, so the person is told when a file they
// may edit came as one.
export function noteReadOnlyCopy(absPath: string, opened: PeerOpened | null | undefined): void {
  if (!opened?.copy || !isEditable(absPath)) return;
  toast(`${basename(absPath)} opened read-only`, {
    description: `This is a copy. The file itself is on ${opened.host}.`,
  });
}

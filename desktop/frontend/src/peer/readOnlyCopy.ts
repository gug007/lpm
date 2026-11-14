import { toast } from "../notifications/toast";
import { isSourceImage, mediaKind } from "../components/fileMedia";
import { basename } from "../path";

// What opening a paired machine's file answers with: whether the app got a
// copy rather than the file itself, whether that copy's saves go back to the
// machine (peercopysync.rs), and which machine has the file.
export interface PeerOpened {
  copy: boolean;
  syncs?: boolean;
  host: string;
}

// Pictures, videos, audio and PDFs are only looked at, so a copy serves them
// as well as the original. Anything else, an SVG too, may be edited.
export function isEditable(absPath: string): boolean {
  return mediaKind(absPath) === null || isSourceImage(absPath);
}

// Saving into a read-only copy would go nowhere, so the person is told when a
// file they may edit came as one.
export function noteReadOnlyCopy(absPath: string, opened: PeerOpened | null | undefined): void {
  if (!opened?.copy || opened.syncs || !isEditable(absPath)) return;
  toast(`${basename(absPath)} opened read-only`, {
    description: `This is a copy. The file itself is on ${opened.host}.`,
  });
}

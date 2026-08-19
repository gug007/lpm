import type { StatusTone } from "../peer/peerStatus";

/** A machine's glyph carries its liveness as its own colour, at every header
 *  height and under the cursor too, so the signal never has to be hunted for.
 *  The `-text` tokens are the pair tuned to read on either theme's ground, which
 *  an 11px stroke needs. */
export function peerPlateClass(tone: StatusTone): string {
  switch (tone) {
    case "live":
      return "text-[var(--accent-green-text)]";
    case "pending":
      return "text-[var(--accent-amber-text)]";
    case "error":
      return "text-[var(--accent-red-text)]";
    default:
      return "text-[var(--text-muted)]";
  }
}

import type { StatusTone } from "../peer/peerStatus";

/** A healthy machine's glyph wears the same neutral tone a folder's does —
 *  connected is the normal state, not news. Only trouble tints the plate, at
 *  every header height and under the cursor too, so the signal never has to be
 *  hunted for. The `-text` tokens are the pair tuned to read on either theme's
 *  ground, which an 11px stroke needs. */
export function peerPlateClass(tone: StatusTone): string {
  switch (tone) {
    case "live":
      return "text-[var(--text-secondary)]";
    case "pending":
      return "text-[var(--accent-amber-text)]";
    case "error":
      return "text-[var(--accent-red-text)]";
    default:
      return "text-[var(--text-muted)]";
  }
}

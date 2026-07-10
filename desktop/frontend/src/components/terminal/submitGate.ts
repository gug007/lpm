// Timing constants + gate decisions for InteractivePane.submitInput, split out so
// they can be unit-tested without standing up an xterm terminal. The "why" in one
// line: a CR sent into Claude Code's async "[Pasted text #N]" collapse/redraw is
// swallowed and never submits, so paste parts are gated on the receiver going
// quiet and the final submit is verified and re-sent if it produced no redraw.

// A multi-part submit gates each paste on the receiver going quiet rather than on
// a fixed delay: Claude Code resolves a pasted image path into an attachment
// asynchronously (reading the file, redrawing its line) with no ack, and pasting
// the next part or the closing CR mid-redraw makes it submit a partial line and
// re-echo the rest. Output going idle is the implicit ack; the ceiling bounds it.
export const PASTE_QUIET_MS = 100;
export const PASTE_CEILING_MS = 1500;
export const QUIET_POLL_MS = 20;
// The image gate waits for the rendered placeholder, not for quiet, so it needs a
// larger ceiling to cover a slow/large file read.
export const PASTE_IMAGE_CEILING_MS = 4000;
// A single-line prompt at or under this length keeps the zero-latency one-shot
// (body+CR) send: Claude Code only collapses much longer pastes into a "[Pasted
// text]" placeholder — the async redraw that swallows a folded CR — so short
// prompts are safe to submit in one write. Above it (when bracketed paste is on)
// we fall back to the gated multi-part path so the CR is gated and verified.
export const PASTE_ONE_SHOT_MAX_CHARS = 200;
// A real submit redraws immediately (input clears, the message enters the
// transcript); if nothing at all arrives within this window after the CR, it was
// swallowed mid-redraw and must be re-sent.
export const CR_VERIFY_GRACE_MS = 500;
// Cap on how many times a swallowed CR is re-sent before giving up (never hang).
export const CR_MAX_RETRIES = 2;

// The one-shot body+CR write is safe only for a single-line body Claude Code
// won't collapse: either bracketed paste is off (no placeholder redraw at all) or
// the body is short enough to stay inline. Everything else must take the gated
// multi-part path so its trailing CR isn't folded into an async paste collapse.
export function canOneShotSubmit(
  input: string,
  bracketedPasteMode: boolean,
  maxChars: number = PASTE_ONE_SHOT_MAX_CHARS,
): boolean {
  if (/[\r\n]/.test(input)) return false;
  return !bracketedPasteMode || input.length <= maxChars;
}

// A CR counts as swallowed only when it produced no output at all: a successful
// submit always redraws immediately. When output DID follow the CR we must NOT
// retry — the message likely landed, and a stray extra Enter into a permission
// prompt is harmful — so only "silence since the CR" is treated as a miss.
export function crWasSwallowed(lastOutputAt: number, crSentAt: number): boolean {
  return lastOutputAt < crSentAt;
}

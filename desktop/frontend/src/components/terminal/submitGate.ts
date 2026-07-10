// Timing constants + gate decisions for InteractivePane.submitInput, split out so
// they can be unit-tested without standing up an xterm terminal. The "why" in one
// line: a CR sent into Claude Code's async "[Pasted text #N]" collapse/redraw is
// swallowed and never submits, so paste parts are gated on the receiver going
// quiet and the final submit is verified and re-sent if it produced no redraw.
//
// Two orthogonal decisions live here. canGlueCr: may the submitting CR ride in
// the SAME pty write as the body? Only when bracketed paste is off — an
// interactive TUI (Claude Code) reads a CR glued to the paste's closing marker as
// pasted content, not Enter, so the text lands in its input but never submits.
// canSkipQuietGate: may the body be written WITHOUT first waiting for the receiver
// to go quiet? Yes for a short/uncollapsible line; the CR still goes as its own
// verified write, just with no pre-write gating.

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
// A single-line prompt at or under this length stays inline in Claude Code's
// input: it only collapses much longer pastes into a "[Pasted text]" placeholder,
// and it's that async collapse/redraw that swallows a CR arriving mid-flight. At
// or under the cap we can write the body without pre-gating it on quiet (the CR
// still goes as its own verified write); above it (bracketed paste on) we gate the
// body on the receiver settling before sending the verified CR.
export const PASTE_INLINE_MAX_CHARS = 200;
// A real submit redraws immediately (input clears, the message enters the
// transcript); if nothing at all arrives within this window after the CR, it was
// swallowed mid-redraw and must be re-sent.
export const CR_VERIFY_GRACE_MS = 500;
// Cap on how many times a swallowed CR is re-sent before giving up (never hang).
export const CR_MAX_RETRIES = 2;

// May the submitting CR be folded into the same pty write as the body? Only with
// bracketed paste off: then there's no paste mode and no async placeholder
// collapse, so a plain shell reads the trailing CR as Enter no matter how long the
// line is. With bracketed paste on, the CR must be a separate, verified write or
// the TUI absorbs it as pasted text (the body appears but never submits). A body
// with an embedded newline always needs bracketing, so it's never glued.
export function canGlueCr(input: string, bracketedPasteMode: boolean): boolean {
  if (/[\r\n]/.test(input)) return false;
  return !bracketedPasteMode;
}

// May the body be written without first waiting for the receiver to go quiet?
// Either bracketed paste is off (no placeholder redraw to write into at all) or
// the line is short enough that Claude Code keeps it inline and never lifts it
// into a "[Pasted text]" placeholder — so nothing is mid-collapse when we write.
// A longer body under bracketed paste must be gated on quiet first. The CR itself
// is always a separate verified write (see submitCr); this only governs the body.
export function canSkipQuietGate(
  input: string,
  bracketedPasteMode: boolean,
  maxChars: number = PASTE_INLINE_MAX_CHARS,
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

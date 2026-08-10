const CSI_RE = /\x1b\[[0-9;]*[A-Za-z]/g;
const OSC_RE = /\x1b\].*?(?:\x07|\x1b\\)/g;
const OTHER_ESC_RE = /\x1b[^[\]].?/g;

// Control characters (0x00-0x1f) except \n (0x0a) and \t (0x09)
const CONTROL_CHARS_RE =
  /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g;

// Terminal spinner characters
const SPINNER_RE = /[|/\-\\]{1,}(?=\s)/g;

// Progress bar block characters
const PROGRESS_BAR_RE = /[█▓▒░]+/g;

// Box-drawing characters (U+2500-U+257F)
const BOX_DRAWING_RE = /[\u2500-\u257f]+/g;

/**
 * Where to resume from to reach `fraction` (0–1) of `text` — the start of the
 * sentence being spoken there, or of the word when the run has no sentence
 * break behind it. Restarting mid-sentence sounds like a skip, so the sentence
 * is repeated instead.
 *
 * The fraction comes from playback progress, which assumes a uniform speaking
 * rate; landing a sentence early or late is the cost of that and is why the
 * boundary is a sentence rather than something finer.
 */
export function resumeOffset(text: string, fraction: number): number {
  const target = Math.floor(Math.max(0, Math.min(1, fraction)) * text.length);
  if (target <= 0) return 0;
  const before = text.slice(0, target);
  const sentence = before.match(/^[\s\S]*[.!?…]["')\]]*\s+/);
  if (sentence) return sentence[0].length;
  const space = before.lastIndexOf(" ");
  return space > 0 ? space + 1 : 0;
}

/** Strip ANSI codes, control chars, collapse whitespace, clean artifacts */
export function preprocessForTTS(raw: string): string {
  let text = raw;

  text = text.replace(CSI_RE, "");
  text = text.replace(OSC_RE, "");
  text = text.replace(OTHER_ESC_RE, "");

  text = text.replace(CONTROL_CHARS_RE, "");

  text = text.replace(/\t/g, " ");

  text = text.replace(SPINNER_RE, "");
  text = text.replace(PROGRESS_BAR_RE, "");
  text = text.replace(BOX_DRAWING_RE, "");

  text = text.replace(/\n{2,}/g, "\n");

  text = text.replace(/ {2,}/g, " ");

  text = text.trim();

  return text;
}


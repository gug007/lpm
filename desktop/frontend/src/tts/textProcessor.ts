// ANSI escape sequence patterns
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


// Markdown → speech, the web counterpart of the phone's SpeechText.swift.
//
// preprocessForTTS strips ANSI, which is what terminal text needs. An automation
// result is markdown, and read literally it is unlistenable: heading hashes
// become "hash hash hash" and a single link swallows twenty seconds of URL.
//
// Notation is removed before sentences matter, then a final rule drops any token
// with no letter or digit in it — the safety net for syntax not handled above.

const IMAGE = /!\[([^\]]*)\]\([^)]*\)/g;
const FOOTNOTE = /\[\^[^\]]*\]/g;
const HTML_TAG = /<\/?[A-Za-z][^>]*>/g;
const TASK_BOX = /^\s*\[[ xX]?\]\s*/;
const LINK_DEFINITION = /^\s*\[[^\]]+\]:\s*\S*\s*$/;
const INLINE_LINK = /\[([^\]]*)\]\([^)]*\)/g;
const URL = /\b(?:https?:\/\/|www\.)\S+/gi;
const FENCE = /^\s*(```|~~~)/;
const RULE = /^\s*([-*_])\1{2,}\s*$/;
const HEADING = /^\s*#{1,6}\s+/;
const LIST_MARKER = /^\s*(?:[-*+]|\d+\.)\s+/;

/** Deleted outright — these glue to words (`**bold**`, `` `code` ``). */
const DELETED = /[*`~^\\‍︀-️]/g;
/** Replaced with a space — these separate words (`a|b`, `> quote`). */
const SPACED = /[_|<>[\]{}=#]/g;

/**
 * Decorative symbols: check marks, arrows, box drawing, progress blocks, emoji.
 * Spoken, these become "check mark", "rightwards arrow", "black square".
 * Currency and "+" are meaning, not decoration, so they survive.
 */
const DECORATIVE =
  /[←-⇿⌀-⏿─-➿⬀-⯿️\u{1F000}-\u{1FAFF}]/gu;

/** One spoken run of text, tagged with the 1-based source line it came from. */
export interface SpeechBlock {
  line: number;
  text: string;
}

export function markdownToSpeech(markdown: string): string {
  return speechBlocks(markdown)
    .map((b) => b.text)
    .join(" ");
}

/**
 * The same normalization, but keeping each run's source line so playback
 * position can be mapped back to the block being spoken.
 */
export function speechBlocks(markdown: string): SpeechBlock[] {
  const lines = markdown.split("\n");
  const out: SpeechBlock[] = [];
  let inFence = false;

  for (const [i, raw] of lines.entries()) {
    const line = i + 1; // react-markdown positions are 1-based
    if (FENCE.test(raw)) {
      inFence = !inFence; // a fence read aloud is noise, not information
      continue;
    }
    if (inFence) continue;
    if (RULE.test(raw)) continue;
    if (LINK_DEFINITION.test(raw)) continue;

    let text = raw
      .replace(IMAGE, "$1") // alt text is prose; the target is not
      .replace(FOOTNOTE, " ")
      .replace(HTML_TAG, " ")
      .replace(TASK_BOX, " ")
      .replace(HEADING, "")
      .replace(LIST_MARKER, "");

    const cells = tableCells(text);
    if (cells !== null) {
      if (cells) out.push({ line, text: cells });
      continue;
    }

    const spoken = clean(text);
    if (spoken) out.push({ line, text: spoken });
  }
  return out;
}

/**
 * Which block is being spoken at `progress` (0–1), by character offset.
 *
 * Approximate by construction: no TTS engine here reports word timings, so this
 * assumes a roughly uniform speaking rate. Good enough at block granularity —
 * a second of drift rarely crosses a paragraph — and deliberately not used for
 * anything finer.
 */
export function speakingLineAt(blocks: SpeechBlock[], progress: number): number | null {
  if (!blocks.length) return null;
  const total = blocks.reduce((n, b) => n + b.text.length + 1, 0);
  if (total === 0) return null;
  const target = Math.min(total, Math.max(0, progress) * total);
  let seen = 0;
  for (const b of blocks) {
    seen += b.text.length + 1;
    if (target <= seen) return b.line;
  }
  return blocks[blocks.length - 1].line;
}

/**
 * A pipe-table row rendered as a phrase, or "" for the `|---|` separator.
 * Returns null when the line is not a table row at all.
 */
function tableCells(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith("|")) return null;
  const cells = trimmed
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((c) => clean(c))
    .filter(speakable);
  return cells.length ? cells.join(", ") : "";
}

function clean(text: string): string {
  return dropWordlessTokens(
    text
      .replace(INLINE_LINK, "$1")
      .replace(URL, " ")
      .replace(DELETED, "")
      .replace(SPACED, " ")
      .replace(DECORATIVE, " "),
  );
}

/**
 * The safety net. Whatever the passes above missed, a run of characters with no
 * letter or digit is notation — a stray bullet, an orphan dash, the "()" left
 * where a link used to be — and is dropped rather than pronounced.
 */
function dropWordlessTokens(text: string): string {
  return text.split(/\s+/).filter(speakable).join(" ");
}

function speakable(token: string): boolean {
  return /[\p{L}\p{N}]/u.test(token);
}

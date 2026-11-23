import { caretInside, lineBeforeCaret, placeCaretAtEnd } from "./composerEditor";
import { insertPlainText } from "./composerEditKeys";

// Selected terminal text as a Markdown quote for the input: each line behind
// "> ", then a blank line, so what is typed next isn't read as part of it.
export function formatQuote(text: string): string {
  const lines = text.replace(/\r/g, "").replace(/^\n+|\n+$/g, "").split("\n");
  return `${lines.map((l) => (l.trim() ? `> ${l}` : ">")).join("\n")}\n\n`;
}

// Readies the caret for a block of lines: in the field, and the line break the
// block needs first (when the caret's line already holds text) handed back.
export function blockBreak(root: HTMLElement): string {
  root.focus();
  if (!caretInside(root)) placeCaretAtEnd(root);
  const line = lineBeforeCaret(root);
  return line && line.trim() ? "\n" : "";
}

// Insert multi-line `text` on lines of its own at the caret: a line already
// holding text gets a break first. The caret ends up after the block.
export function insertBlockAtCaret(root: HTMLElement, text: string): void {
  insertPlainText(root, blockBreak(root) + text);
}

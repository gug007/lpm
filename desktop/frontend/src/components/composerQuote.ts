import { caretInside, lineBeforeCaret, placeCaretAtEnd } from "./composerEditor";
import { insertPlainText } from "./composerEditKeys";

// Selected terminal text as a Markdown quote for the input: each line behind
// "> ", then a blank line, so what is typed next isn't read as part of it.
export function formatQuote(text: string): string {
  const lines = text.replace(/\r/g, "").replace(/^\n+|\n+$/g, "").split("\n");
  return `${lines.map((l) => (l.trim() ? `> ${l}` : ">")).join("\n")}\n\n`;
}

// Insert multi-line `text` on lines of its own at the caret: a line already
// holding text gets a break first. The caret ends up after the block.
export function insertBlockAtCaret(root: HTMLElement, text: string): void {
  root.focus();
  if (!caretInside(root)) placeCaretAtEnd(root);
  const line = lineBeforeCaret(root);
  insertPlainText(root, line && line.trim() ? `\n${text}` : text);
}

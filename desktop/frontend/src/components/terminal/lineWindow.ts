import type { IBuffer, IBufferCell, IBufferLine } from "@xterm/xterm";

const MAX_WINDOW_CHARS = 2048;
const MAX_WINDOW_ROWS = 64;
// How near the right edge a row must end, after room for the next row's first
// word, to read as an agent's renderer having pushed that word down a row.
const EDGE_SLACK = 4;
// What may sit either side of a cut in the middle of a path.
const CUT_CHAR = /[\w./\\~@+()[\]-]/;

// One logical (possibly wrapped) buffer line as it reads on screen, plus the
// buffer coordinates every character came from. String offsets are not column
// numbers: a wide glyph is one character across two cells and a glyph with
// combining marks is several characters in one cell, so a path found in `text`
// has to be mapped back through these to underline the cells it was drawn in.
export interface LineWindow {
  text: string;
  x: number[];
  y: number[];
  width: number[];
}

function appendLine(win: LineWindow, line: IBufferLine, y: number, cell: IBufferCell): void {
  let text = "";
  const x: number[] = [];
  const width: number[] = [];
  for (let col = 0; col < line.length; col++) {
    if (!line.getCell(col, cell)) continue;
    const w = cell.getWidth();
    if (w === 0) continue; // trailing half of a wide glyph
    const chars = cell.getChars() || " ";
    for (let i = 0; i < chars.length; i++) {
      x.push(col);
      width.push(w);
    }
    text += chars;
  }
  // Trailing blanks are padding, not content — dropping them lets a wrapped
  // continuation join tight to the row above.
  let end = text.length;
  while (end > 0 && text[end - 1] === " ") end--;
  win.text += text.slice(0, end);
  for (let i = 0; i < end; i++) {
    win.x.push(x[i]);
    win.y.push(y);
    win.width.push(width[i]);
  }
}

// Claude Code wraps its own output, breaking at a blank with a real newline, so
// xterm never marks the next row as a continuation. A row that ends where the
// next row's first word would no longer have fit reads as one that was.
function wordWrapped(a: LineWindow, b: LineWindow, cols: number): boolean {
  const n = a.text.length;
  const word = b.text.trimStart().match(/^\S+/)?.[0].length ?? 0;
  if (n === 0 || word === 0) return false;
  return a.x[n - 1] + a.width[n - 1] + 1 + word > cols - EDGE_SLACK;
}

// A path longer than the row it breaks at the last column instead, with no
// blank at the cut, and indents the rest.
function cutAtEdge(a: LineWindow, b: LineWindow, cols: number): boolean {
  const n = a.text.length;
  const head = b.text.trimStart();
  if (n === 0 || head.length === 0) return false;
  return a.x[n - 1] + a.width[n - 1] >= cols - EDGE_SLACK && CUT_CHAR.test(a.text[n - 1]) && CUT_CHAR.test(head[0]);
}

// The logical line around a row: the rows xterm soft-wrapped into it and, given
// `cols`, the rows an agent word-wrapped, joined back with the blank the break
// took and without the next row's indent. With `cut` it instead joins the rows
// an agent broke mid-path at the right edge, tight.
export function readLineWindow(buffer: IBuffer, lineIndex: number, cols = 0, cut = false): LineWindow {
  const win: LineWindow = { text: "", x: [], y: [], width: [] };
  if (!buffer.getLine(lineIndex)) return win;

  const cell = buffer.getNullCell();
  const rows = new Map<number, LineWindow>();
  const rowAt = (y: number): LineWindow => {
    let row = rows.get(y);
    if (!row) {
      row = { text: "", x: [], y: [], width: [] };
      const line = buffer.getLine(y);
      if (line) appendLine(row, line, y, cell);
      rows.set(y, row);
    }
    return row;
  };
  const joins = cut ? cutAtEdge : wordWrapped;
  const softWrapped = (y: number) => !!buffer.getLine(y)?.isWrapped;
  const continues = (y: number) =>
    !!buffer.getLine(y + 1) && (softWrapped(y + 1) || (cols > 0 && joins(rowAt(y), rowAt(y + 1), cols)));

  let top = lineIndex;
  while (top > 0 && lineIndex - top < MAX_WINDOW_ROWS && continues(top - 1)) top--;

  for (let y = top; ; y++) {
    const row = rowAt(y);
    let from = 0;
    if (y > top && !softWrapped(y)) {
      from = row.text.length - row.text.trimStart().length;
      if (!cut) {
        win.text += " ";
        win.x.push(row.x[from]);
        win.y.push(y);
        win.width.push(row.width[from]);
      }
    }
    win.text += row.text.slice(from);
    win.x.push(...row.x.slice(from));
    win.y.push(...row.y.slice(from));
    win.width.push(...row.width.slice(from));
    if (win.text.length >= MAX_WINDOW_CHARS || !continues(y)) break;
  }
  return win;
}

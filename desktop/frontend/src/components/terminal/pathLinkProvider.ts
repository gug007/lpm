import type {
  IBuffer,
  IBufferCell,
  IBufferLine,
  IBufferRange,
  IDisposable,
  ILink,
  ILinkProvider,
  Terminal,
} from "@xterm/xterm";
import { toast } from "sonner";
import { joinAbs } from "../../path";
import { getSettings } from "../../store/settings";
import { openFileViewer } from "../../store/fileViewer";
import { OpenPathInDefaultApp } from "../../../bridge/commands";

// Matches paths with at least one separator and a file extension, optionally
// followed by `:line` or `:line:col`. The lookbehind enforces a token boundary
// so substrings like `xfoo/bar.ts` inside a longer word don't match. The Go
// side expands `~/` to the user's home before stat/read/write.
const PATH_RE =
  /(?<![\w./-])((?:~\/|\.{1,2}\/|\/|[\w.-]+\/)[\w./-]*\.[a-zA-Z][\w]{0,4})(?::(\d+)(?::(\d+))?)?/g;

const MAX_WINDOW_CHARS = 2048;
const MAX_WINDOW_ROWS = 64;

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

export function readLineWindow(buffer: IBuffer, lineIndex: number): LineWindow {
  const win: LineWindow = { text: "", x: [], y: [], width: [] };
  if (!buffer.getLine(lineIndex)) return win;

  let top = lineIndex;
  while (top > 0 && lineIndex - top < MAX_WINDOW_ROWS && buffer.getLine(top)?.isWrapped) top--;

  const cell = buffer.getNullCell();
  for (let y = top; ; y++) {
    const line = buffer.getLine(y);
    if (!line || (y > top && !line.isWrapped)) break;
    appendLine(win, line, y, cell);
    if (win.text.length >= MAX_WINDOW_CHARS) break;
  }
  return win;
}

export interface PathMatch {
  raw: string;
  text: string;
  line: number;
  col: number;
  range: IBufferRange;
}

// Paths on the logical line the given row belongs to, in buffer coordinates.
// bufferLineNumber is 1-based, matching ILinkProvider.provideLinks.
export function findPathMatches(buffer: IBuffer, bufferLineNumber: number): PathMatch[] {
  const win = readLineWindow(buffer, bufferLineNumber - 1);
  if (!win.text) return [];

  const out: PathMatch[] = [];
  PATH_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = PATH_RE.exec(win.text)) !== null) {
    const startIdx = m.index;
    const lastIdx = m.index + m[0].length - 1;
    if (win.x[startIdx] === undefined || win.x[lastIdx] === undefined) continue;
    out.push({
      raw: m[1],
      text: m[0],
      line: m[2] ? Number.parseInt(m[2], 10) : 0,
      col: m[3] ? Number.parseInt(m[3], 10) : 0,
      range: {
        start: { x: win.x[startIdx] + 1, y: win.y[startIdx] + 1 },
        end: { x: win.x[lastIdx] + win.width[lastIdx], y: win.y[lastIdx] + 1 },
      },
    });
  }
  return out;
}

export interface PathLinkProviderOptions {
  // Resolved at click time so updating session.cwd doesn't require re-registering.
  // Used for resolving relative paths and as the working dir for git operations
  // in the file viewer modal.
  getCwd: () => string;
}

export function registerPathLinkProvider(
  term: Terminal,
  opts: PathLinkProviderOptions,
): IDisposable {
  const provider: ILinkProvider = {
    provideLinks(bufferLineNumber, callback) {
      const cwd = opts.getCwd();
      const matches = findPathMatches(term.buffer.active, bufferLineNumber);
      if (matches.length === 0) {
        callback(undefined);
        return;
      }
      // Tilde and absolute matches don't need a cwd; relative ones do — drop
      // them when we have nothing to resolve against.
      const links: ILink[] = [];
      for (const m of matches) {
        const isAbs = m.raw.startsWith("/") || m.raw.startsWith("~/");
        if (!isAbs && !cwd) continue;
        const abs = joinAbs(cwd, m.raw);
        links.push({
          range: m.range,
          text: m.text,
          activate: () => {
            if (getSettings().terminalOpenInDefaultApp) {
              OpenPathInDefaultApp(abs).catch((err) => toast.error(`Open in Default app: ${err}`));
              return;
            }
            openFileViewer({
              absPath: abs,
              line: m.line,
              col: m.col,
              projectRoot: cwd,
            });
          },
        });
      }
      callback(links.length > 0 ? links : undefined);
    },
  };
  return term.registerLinkProvider(provider);
}

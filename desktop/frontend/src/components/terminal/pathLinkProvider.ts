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
import { isPeerMarked } from "../../peer/markers";
import { getSettings } from "../../store/settings";
import { openFileViewer } from "../../store/fileViewer";
import { OpenPathInDefaultApp } from "../../../bridge/commands";
import { candidatesFor, loadFileIndex } from "./fileIndex";

// Matches paths with at least one separator and a whole file extension,
// optionally followed by a position: `:line[:col]`, tsc's `(line[,col])` or
// `#Lline[Ccol]`. Segments may hold route brackets (`[id]`, `(group)`) and
// scoped packages (`@types`), but a path never starts with `@` or `+`, so an
// agent's `@src/a.ts` mention and a diff's `+src/a.ts` line link `src/a.ts`.
// The lookbehinds enforce a token boundary and keep a match from starting at
// a `/` or digit right after `:` (a URL's tail, a port), while `12:src/a.ts`
// and `HEAD:src/a.ts` still link; `file://` is taken as a prefix of the link,
// not of the path. The Rust side expands `~/` to the user's home before
// stat/read/write. Kept in step with the phone's copy in mobile/web/pathtap.js.
const SEG = String.raw`(?:[\w.@+-]|\[{1,2}[\w.-]+\]{1,2}|\([\w.-]+\))`;
const POSITION = String.raw`(?::(\d+)(?::(\d+))?|\((\d+)(?:,\s?(\d+))?\)|#L(\d+)(?:C(\d+))?(?:-L?\d+)?)?`;
const PATH_RE = new RegExp(
  String.raw`(?<![\w./~-])(?<!:(?=[\d/]))(?:file:\/\/(?=\/))?` +
    String.raw`((?:~\/|\.{1,2}\/|\/|(?![@+])${SEG}+\/)(?:${SEG}|\/)*\.[a-zA-Z]\w{0,9})(?![\w/])` +
    POSITION,
  "g",
);

// A bare file name (`FileViewer.tsx`, `.env.local`), with the same positions.
// It links only when the project has a file by that name, so prose like
// `Node.js` or `e.g.` stays plain.
const NAME_RE = new RegExp(
  String.raw`(?<![\w./~@+:-])(\.?[\w@+-][\w.@+-]*\.[a-zA-Z]\w{0,9})(?![\w/@+-])` + POSITION,
  "g",
);

function position(m: RegExpExecArray): { line: number; col: number } {
  const num = (s: string | undefined) => (s ? Number.parseInt(s, 10) : 0);
  return { line: num(m[2] ?? m[4] ?? m[6]), col: num(m[3] ?? m[5] ?? m[7]) };
}

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

function collect(win: LineWindow, re: RegExp, taken: [number, number][]): PathMatch[] {
  const out: PathMatch[] = [];
  re.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(win.text)) !== null) {
    const startIdx = m.index;
    const lastIdx = m.index + m[0].length - 1;
    if (win.x[startIdx] === undefined || win.x[lastIdx] === undefined) continue;
    if (taken.some(([a, b]) => startIdx <= b && lastIdx >= a)) continue;
    taken.push([startIdx, lastIdx]);
    out.push({
      raw: m[1],
      text: m[0],
      ...position(m),
      range: {
        start: { x: win.x[startIdx] + 1, y: win.y[startIdx] + 1 },
        end: { x: win.x[lastIdx] + win.width[lastIdx], y: win.y[lastIdx] + 1 },
      },
    });
  }
  return out;
}

// Paths on the logical line the given row belongs to, in buffer coordinates,
// and the bare file names outside them. bufferLineNumber is 1-based, matching
// ILinkProvider.provideLinks.
export function scanLine(buffer: IBuffer, bufferLineNumber: number) {
  const win = readLineWindow(buffer, bufferLineNumber - 1);
  if (!win.text) return { paths: [], names: [] };
  const taken: [number, number][] = [];
  const paths = collect(win, PATH_RE, taken);
  return { paths, names: collect(win, NAME_RE, taken) };
}

export function findPathMatches(buffer: IBuffer, bufferLineNumber: number): PathMatch[] {
  return scanLine(buffer, bufferLineNumber).paths;
}

export interface PathLinkProviderOptions {
  // Resolved at click time so updating session.cwd doesn't require re-registering.
  // Used for resolving relative paths and as the working dir for git operations
  // in the file viewer modal.
  getCwd: () => string;
}

const isAbsolute = (raw: string) => raw.startsWith("/") || raw.startsWith("~/");
const RELOOK_MS = 5_000;

// A relative reference names a project file when the index can say which: the
// path as printed if it exists, the one file it is the tail of, or several to
// choose from. A file too new for the cached index gets one fresher look.
async function projectFiles(cwd: string, raw: string): Promise<string[]> {
  if (!cwd || isAbsolute(raw)) return [];
  const cached = await loadFileIndex(cwd);
  const found = cached ? candidatesFor(cached, raw) : [];
  if (found.length > 0) return found;
  const fresh = await loadFileIndex(cwd, RELOOK_MS);
  return fresh && fresh !== cached ? candidatesFor(fresh, raw) : [];
}

async function openMatch(m: PathMatch, cwd: string): Promise<void> {
  const files = (await projectFiles(cwd, m.raw)).map((rel) => joinAbs(cwd, rel));
  const abs = files[0] ?? joinAbs(cwd, m.raw);
  // A connected Mac's file would open in an app over there, not here, so it
  // always gets the viewer, which reads it from that Mac.
  if (files.length <= 1 && getSettings().terminalOpenInDefaultApp && !isPeerMarked(abs)) {
    OpenPathInDefaultApp(abs).catch((err) => toast.error(`Open in Default app: ${err}`));
    return;
  }
  openFileViewer({
    absPath: abs,
    line: m.line,
    col: m.col,
    projectRoot: cwd,
    ...(files.length > 1 ? { choices: files } : {}),
  });
}

export function registerPathLinkProvider(
  term: Terminal,
  opts: PathLinkProviderOptions,
): IDisposable {
  const provider: ILinkProvider = {
    provideLinks(bufferLineNumber, callback) {
      const cwd = opts.getCwd();
      const { paths, names } = scanLine(term.buffer.active, bufferLineNumber);
      const link = (m: PathMatch): ILink => ({
        range: m.range,
        text: m.text,
        activate: () => void openMatch(m, cwd),
      });
      // Tilde and absolute matches don't need a cwd; relative ones do — drop
      // them when we have nothing to resolve against.
      const links = paths.filter((m) => isAbsolute(m.raw) || cwd).map(link);
      if (!cwd || names.length === 0) {
        // Hovering warms the index, so a click resolves at once.
        if (cwd && paths.some((m) => !isAbsolute(m.raw))) void loadFileIndex(cwd);
        callback(links.length > 0 ? links : undefined);
        return;
      }
      void loadFileIndex(cwd).then((index) => {
        for (const m of names) if (index?.byName.has(m.raw)) links.push(link(m));
        callback(links.length > 0 ? links : undefined);
      });
    },
  };
  return term.registerLinkProvider(provider);
}

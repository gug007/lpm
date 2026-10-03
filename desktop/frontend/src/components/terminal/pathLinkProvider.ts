import type {
  IBuffer,
  IBufferCell,
  IBufferCellPosition,
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
import { candidatesFor, fileExists, loadFileIndex } from "./fileIndex";

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

// An absolute path can hold spaces (`~/Downloads/Q3 Report (final).pdf`), and
// then its shape no longer says where it ends, since prose has spaces too. From
// each place one could start, every end it could have is a candidate, longest
// first, and only one the disk confirms becomes a link. A blank before another
// path, a column gap, a tab or a quote ends the run; `\ ` is a shell-escaped space.
const SPACED_START_RE = /(?<![\w./~\\-])(file:\/\/(?=\/))?(?=~?\/[^\s/])/g;
const SPACED_END_RE = /\.[a-zA-Z]\w{0,9}(?![\w/])/g;
const SPACED_BREAK_RE = /\s~?\/|\s\s|[\t"`]/;
const SPACED_POSITION_RE = new RegExp(POSITION, "y");
const MAX_SPACED_CHARS = 400;
const MAX_SPACED_CANDIDATES = 8;

// POSITION's six groups: line and col for each of its three forms.
function position(g: (string | undefined)[]): { line: number; col: number } {
  const num = (s: string | undefined) => (s ? Number.parseInt(s, 10) : 0);
  return { line: num(g[0] ?? g[2] ?? g[4]), col: num(g[1] ?? g[3] ?? g[5]) };
}

const MAX_WINDOW_CHARS = 2048;
const MAX_WINDOW_ROWS = 64;
// How near the right edge a row must end, after room for the next row's first
// word, to read as an agent's renderer having pushed that word down a row.
const EDGE_SLACK = 4;

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

// The logical line around a row: the rows xterm soft-wrapped into it and, given
// `cols`, the rows an agent word-wrapped, joined back with the blank the break
// took and without the next row's indent.
export function readLineWindow(buffer: IBuffer, lineIndex: number, cols = 0): LineWindow {
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
  const softWrapped = (y: number) => !!buffer.getLine(y)?.isWrapped;
  const continues = (y: number) =>
    !!buffer.getLine(y + 1) &&
    (softWrapped(y + 1) || (cols > 0 && wordWrapped(rowAt(y), rowAt(y + 1), cols)));

  let top = lineIndex;
  while (top > 0 && lineIndex - top < MAX_WINDOW_ROWS && continues(top - 1)) top--;

  for (let y = top; ; y++) {
    const row = rowAt(y);
    let from = 0;
    if (y > top && !softWrapped(y)) {
      from = row.text.length - row.text.trimStart().length;
      win.text += " ";
      win.x.push(row.x[from]);
      win.y.push(y);
      win.width.push(row.width[from]);
    }
    win.text += row.text.slice(from);
    win.x.push(...row.x.slice(from));
    win.y.push(...row.y.slice(from));
    win.width.push(...row.width.slice(from));
    if (win.text.length >= MAX_WINDOW_CHARS || !continues(y)) break;
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

function rangeOf(win: LineWindow, startIdx: number, lastIdx: number): IBufferRange {
  return {
    start: { x: win.x[startIdx] + 1, y: win.y[startIdx] + 1 },
    end: { x: win.x[lastIdx] + win.width[lastIdx], y: win.y[lastIdx] + 1 },
  };
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
    out.push({ raw: m[1], text: m[0], ...position(m.slice(2)), range: rangeOf(win, startIdx, lastIdx) });
  }
  return out;
}

// The readings of each spaced run that reaches row `y` (1-based), longest
// first, for the caller to try against the disk.
function spacedCandidates(win: LineWindow, y: number): PathMatch[][] {
  const groups: PathMatch[][] = [];
  let budget = MAX_SPACED_CANDIDATES;
  for (const s of win.text.matchAll(SPACED_START_RE)) {
    if (budget <= 0) break;
    const from = s.index + s[0].length;
    const tail = win.text.slice(from, from + MAX_SPACED_CHARS);
    // Cut before the break's last character, so no reading holds a whole one.
    const brk = SPACED_BREAK_RE.exec(tail);
    const run = brk ? tail.slice(0, brk.index + brk[0].length - 1) : tail;
    const group: PathMatch[] = [];
    for (const e of run.matchAll(SPACED_END_RE)) {
      const body = run.slice(0, e.index + e[0].length);
      if (!body.includes(" ")) continue;
      SPACED_POSITION_RE.lastIndex = from + body.length;
      // POSITION is optional, so the sticky match always lands, if empty.
      const pos = SPACED_POSITION_RE.exec(win.text)!;
      const lastIdx = from + body.length + pos[0].length - 1;
      const range = rangeOf(win, s.index, lastIdx);
      if (range.start.y > y || range.end.y < y) continue;
      group.push({
        raw: body.replace(/\\(.)/g, "$1"),
        text: win.text.slice(s.index, lastIdx + 1),
        ...position(pos.slice(1)),
        range,
      });
    }
    if (group.length > 0) groups.push(group.reverse().slice(0, budget));
    budget -= group.length;
  }
  return groups;
}

// Paths on the logical line the given row belongs to, in buffer coordinates,
// the bare file names outside them, and the readings of any path with spaces
// (`cols` lets those follow an agent's own line breaks). bufferLineNumber is
// 1-based, matching ILinkProvider.provideLinks.
export function scanLine(buffer: IBuffer, bufferLineNumber: number, cols = 0) {
  const win = readLineWindow(buffer, bufferLineNumber - 1);
  if (!win.text) return { paths: [], names: [], spaced: [] };
  const taken: [number, number][] = [];
  const paths = collect(win, PATH_RE, taken);
  const names = collect(win, NAME_RE, taken);
  const joined = cols > 0 ? readLineWindow(buffer, bufferLineNumber - 1, cols) : win;
  return { paths, names, spaced: spacedCandidates(joined, bufferLineNumber) };
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

// The longest reading of each spaced run that names a file.
async function confirmSpaced(groups: PathMatch[][], cwd: string): Promise<PathMatch[]> {
  const picks = await Promise.all(
    groups.map(async (group) => {
      const found = await Promise.all(group.map((m) => fileExists(joinAbs(cwd, m.raw))));
      return group[found.indexOf(true)];
    }),
  );
  return picks.filter((m): m is PathMatch => m !== undefined);
}

const atOrBefore = (a: IBufferCellPosition, b: IBufferCellPosition) =>
  a.y < b.y || (a.y === b.y && a.x <= b.x);
const overlaps = (a: IBufferRange, b: IBufferRange) =>
  atOrBefore(a.start, b.end) && atOrBefore(b.start, a.end);

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
  // A connected Mac's file always gets the viewer, which reads it where it is;
  // a default app here could only be handed a read-only copy of it.
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
      const { paths, names, spaced } = scanLine(term.buffer.active, bufferLineNumber, term.cols);
      const link = (m: PathMatch): ILink => ({
        range: m.range,
        text: m.text,
        activate: () => void openMatch(m, cwd),
      });
      // Tilde and absolute matches don't need a cwd; relative ones do — drop
      // them when we have nothing to resolve against.
      const direct = paths.filter((m) => isAbsolute(m.raw) || cwd);
      const projectNames =
        cwd && names.length > 0
          ? loadFileIndex(cwd).then((index) => names.filter((m) => index?.byName.has(m.raw)))
          : null;
      if (!projectNames && spaced.length === 0) {
        // Hovering warms the index, so a click resolves at once.
        if (cwd && paths.some((m) => !isAbsolute(m.raw))) void loadFileIndex(cwd);
        callback(direct.length > 0 ? direct.map(link) : undefined);
        return;
      }
      void Promise.all([confirmSpaced(spaced, cwd), projectNames ?? []]).then(([long, short]) => {
        // A path with spaces outranks the pieces of it that read as paths alone.
        const rest = [...direct, ...short].filter((m) => !long.some((l) => overlaps(l.range, m.range)));
        const links = [...long, ...rest].map(link);
        callback(links.length > 0 ? links : undefined);
      });
    },
  };
  return term.registerLinkProvider(provider);
}

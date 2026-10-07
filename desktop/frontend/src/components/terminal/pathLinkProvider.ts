import type {
  IBuffer,
  IBufferCellPosition,
  IBufferRange,
  IDisposable,
  ILink,
  ILinkProvider,
  Terminal,
} from "@xterm/xterm";
import {
  fromMsysPath,
  isAbsolutePath,
  joinAbs,
  type MsysMounts,
  toSlash,
  windowsRules,
} from "../../path";
import { isPeerMarked, windowsRootMarker } from "../../peer/markers";
import { isWindows } from "../../platform";
import { getSettings } from "../../store/settings";
import { openFileViewer } from "../../store/fileViewer";
import { candidatesFor, fileExists, loadFileIndex } from "./fileIndex";
import { type LineWindow, readLineWindow } from "./lineWindow";
import { msysMounts } from "./msysMounts";
import { openInDefaultApp } from "./openInDefaultApp";

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

// Windows only: drive (`C:\x\a.ts`, `C:/x/a.ts`, `file:///C:/x/a.ts`) and
// share (`\\srv\share\a.ts`) paths, and relative ones written with backslashes
// (`src\a.ts`), with the same positions. Git Bash's `/c/x/a.ts` is a POSIX
// path to PATH_RE and is mapped to its drive when opened.
const WIN_SEG = String.raw`(?:[\w.@+~-]|\[{1,2}[\w.-]+\]{1,2}|\([\w.-]+\))`;
const WIN_PATH_RE = new RegExp(
  String.raw`(?<![\w./\\~-])(?:file:\/\/\/(?=[A-Za-z]:))?` +
    String.raw`((?:[A-Za-z]:[\\/]|\\\\${WIN_SEG}+\\${WIN_SEG}+\\|(?![@+])${WIN_SEG}+\\)(?:${WIN_SEG}|[\\/])*\.[a-zA-Z]\w{0,9})(?![\w/\\])` +
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

interface SpacedRules {
  start: RegExp;
  end: RegExp;
  brk: RegExp;
  unescape: boolean;
}

const POSIX_SPACED: SpacedRules[] = [
  { start: SPACED_START_RE, end: SPACED_END_RE, brk: SPACED_BREAK_RE, unescape: true },
];

// On Windows `C:\Program Files\…` is the common spaced path, and a backslash
// there is a separator, never an escape. A POSIX run never starts right after
// a drive's colon, where it would only be that path's tail.
const WIN_SPACED: SpacedRules[] = [
  {
    start: /(?<![\w./~\\:-])(file:\/\/(?=\/))?(?=~?\/[^\s/])/g,
    end: SPACED_END_RE,
    brk: /\s~?\/|\s[A-Za-z]:[\\/]|\s\s|[\t"`]/,
    unescape: true,
  },
  {
    start: /(?<![\w./\\~-])(file:\/\/\/)?(?=[A-Za-z]:[\\/][^\s\\/])/g,
    end: /\.[a-zA-Z]\w{0,9}(?![\w/\\])/g,
    brk: /\s~?\/|\s[A-Za-z]:[\\/]|\s\s|[\t"`]/,
    unescape: false,
  },
];
const MAX_SPACED_CHARS = 400;
const MAX_SPACED_CANDIDATES = 8;

// POSITION's six groups: line and col for each of its three forms.
function position(g: (string | undefined)[]): { line: number; col: number } {
  const num = (s: string | undefined) => (s ? Number.parseInt(s, 10) : 0);
  return { line: num(g[0] ?? g[2] ?? g[4]), col: num(g[1] ?? g[3] ?? g[5]) };
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
function spacedCandidates(win: LineWindow, y: number, rulesets: SpacedRules[]): PathMatch[][] {
  const groups: PathMatch[][] = [];
  let budget = MAX_SPACED_CANDIDATES;
  for (const rules of rulesets) {
    for (const s of win.text.matchAll(rules.start)) {
      if (budget <= 0) break;
      const from = s.index + s[0].length;
      const tail = win.text.slice(from, from + MAX_SPACED_CHARS);
      // Cut before the break's last character, so no reading holds a whole one.
      const brk = rules.brk.exec(tail);
      const run = brk ? tail.slice(0, brk.index + brk[0].length - 1) : tail;
      const group: PathMatch[] = [];
      for (const e of run.matchAll(rules.end)) {
        const body = run.slice(0, e.index + e[0].length);
        if (!body.includes(" ")) continue;
        SPACED_POSITION_RE.lastIndex = from + body.length;
        // POSITION is optional, so the sticky match always lands, if empty.
        const pos = SPACED_POSITION_RE.exec(win.text)!;
        const lastIdx = from + body.length + pos[0].length - 1;
        const range = rangeOf(win, s.index, lastIdx);
        if (range.start.y > y || range.end.y < y) continue;
        group.push({
          raw: rules.unescape ? body.replace(/\\(.)/g, "$1") : body,
          text: win.text.slice(s.index, lastIdx + 1),
          ...position(pos.slice(1)),
          range,
        });
      }
      if (group.length > 0) groups.push(group.reverse().slice(0, budget));
      budget -= group.length;
    }
  }
  return groups;
}

// Paths an agent broke at the right edge that reach row `y` (1-based), read
// across the cut for the caller to try against the disk.
function cutCandidates(win: LineWindow, y: number, windows: boolean): PathMatch[] {
  const taken: [number, number][] = [];
  const found = [...(windows ? collect(win, WIN_PATH_RE, taken) : []), ...collect(win, PATH_RE, taken)];
  return found.filter((m) => m.range.start.y !== m.range.end.y && m.range.start.y <= y && m.range.end.y >= y);
}

// Paths on the logical line the given row belongs to, in buffer coordinates,
// the bare file names outside them, the readings of any path with spaces and
// of any path cut at the right edge (`cols` lets those two follow an agent's
// own line breaks). bufferLineNumber is 1-based, matching
// ILinkProvider.provideLinks. `windows` adds Windows paths.
export function scanLine(buffer: IBuffer, bufferLineNumber: number, cols = 0, windows = isWindows) {
  const win = readLineWindow(buffer, bufferLineNumber - 1);
  if (!win.text) return { paths: [], names: [], spaced: [], cut: [] };
  const taken: [number, number][] = [];
  const winPaths = windows ? collect(win, WIN_PATH_RE, taken) : [];
  const paths = [...winPaths, ...collect(win, PATH_RE, taken)];
  const names = collect(win, NAME_RE, taken);
  const joined = cols > 0 ? readLineWindow(buffer, bufferLineNumber - 1, cols) : win;
  const spaced = spacedCandidates(joined, bufferLineNumber, windows ? WIN_SPACED : POSIX_SPACED);
  const cut = cols > 0 ? cutCandidates(readLineWindow(buffer, bufferLineNumber - 1, cols, true), bufferLineNumber, windows) : [];
  return { paths, names, spaced, cut };
}

export function findPathMatches(
  buffer: IBuffer,
  bufferLineNumber: number,
  windows = isWindows,
): PathMatch[] {
  return scanLine(buffer, bufferLineNumber, 0, windows).paths;
}

export interface PathLinkProviderOptions {
  // Resolved at click time so updating session.cwd doesn't require re-registering.
  // Used for resolving relative paths and as the working dir for git operations
  // in the file viewer modal.
  getCwd: () => string;
}

// A terminal on a paired Windows host prints Windows paths wherever it is shown.
const windowsCwd = (cwd: string) => isWindows || windowsRules(cwd);
const isAbsolute = (raw: string, cwd: string) => isAbsolutePath(raw, windowsCwd(cwd));
const RELOOK_MS = 5_000;

// Where a printed path points: against the cwd, and on Windows with Git Bash's
// `/c/…`, `/tmp/…` and `/usr/…` spellings turned back into the paths this
// machine can open. A paired Windows host's Git Bash gets its drive and share
// spellings mapped; where its own tree is, only that host knows.
export function resolvePrinted(
  cwd: string,
  raw: string,
  windows = isWindows,
  mounts: MsysMounts | null = null,
): string {
  const local = windowsRootMarker(cwd)
    ? fromMsysPath(raw)
    : windows && !isPeerMarked(cwd)
      ? fromMsysPath(raw, mounts)
      : raw;
  return joinAbs(cwd, local, windows);
}

// The first reading of each group that names a file: the longest of a spaced
// run, or a path read across an agent's cut.
async function confirmOnDisk(groups: PathMatch[][], cwd: string): Promise<PathMatch[]> {
  const mounts = await msysMounts();
  const picks = await Promise.all(
    groups.map(async (group) => {
      const found = await Promise.all(
        group.map((m) => fileExists(resolvePrinted(cwd, m.raw, isWindows, mounts))),
      );
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
  if (!cwd || isAbsolute(raw, cwd)) return [];
  const printed = windowsRules(cwd) ? toSlash(raw, true) : raw;
  const cached = await loadFileIndex(cwd);
  const found = cached ? candidatesFor(cached, printed) : [];
  if (found.length > 0) return found;
  const fresh = await loadFileIndex(cwd, RELOOK_MS);
  return fresh && fresh !== cached ? candidatesFor(fresh, printed) : [];
}

async function openMatch(m: PathMatch, cwd: string): Promise<void> {
  const files = (await projectFiles(cwd, m.raw)).map((rel) => joinAbs(cwd, rel));
  const abs = files[0] ?? resolvePrinted(cwd, m.raw, isWindows, await msysMounts());
  // A connected Mac's file always gets the viewer, which reads it where it is;
  // a default app here could only be handed a read-only copy of it.
  if (
    files.length <= 1 &&
    getSettings().terminalOpenInDefaultApp &&
    !isPeerMarked(abs) &&
    openInDefaultApp(abs)
  ) {
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
      const { paths, names, spaced, cut } = scanLine(
        term.buffer.active,
        bufferLineNumber,
        term.cols,
        windowsCwd(cwd),
      );
      const link = (m: PathMatch): ILink => ({
        range: m.range,
        text: m.text,
        activate: () => void openMatch(m, cwd),
      });
      // Tilde and absolute matches don't need a cwd; relative ones do — drop
      // them when we have nothing to resolve against.
      const direct = paths.filter((m) => isAbsolute(m.raw, cwd) || cwd);
      const projectNames =
        cwd && names.length > 0
          ? loadFileIndex(cwd).then((index) => names.filter((m) => index?.byName.has(m.raw)))
          : null;
      const readings = [...spaced, ...cut.map((m) => [m])];
      if (!projectNames && readings.length === 0) {
        // Hovering warms the index, so a click resolves at once.
        if (cwd && paths.some((m) => !isAbsolute(m.raw, cwd))) void loadFileIndex(cwd);
        callback(direct.length > 0 ? direct.map(link) : undefined);
        return;
      }
      void Promise.all([confirmOnDisk(readings, cwd), projectNames ?? []]).then(([long, short]) => {
        // A path with spaces or cut by the agent outranks the pieces of it that
        // read as paths alone.
        const rest = [...direct, ...short].filter((m) => !long.some((l) => overlaps(l.range, m.range)));
        const links = [...long, ...rest].map(link);
        callback(links.length > 0 ? links : undefined);
      });
    },
  };
  return term.registerLinkProvider(provider);
}

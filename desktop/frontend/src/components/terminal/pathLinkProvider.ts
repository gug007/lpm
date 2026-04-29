import type {
  IBufferRange,
  IDisposable,
  ILink,
  ILinkProvider,
  Terminal,
} from "@xterm/xterm";
import { joinAbs } from "../../path";
import { openFileViewer } from "../../store/fileViewer";

// Matches paths with at least one separator and a file extension, optionally
// followed by `:line` or `:line:col`. The lookbehind enforces a token boundary
// so substrings like `xfoo/bar.ts` inside a longer word don't match. The Go
// side expands `~/` to the user's home before stat/read/write.
const PATH_RE =
  /(?<![\w./-])((?:~\/|\.{1,2}\/|\/|[\w.-]+\/)[\w./-]*\.[a-zA-Z][\w]{0,4})(?::(\d+)(?::(\d+))?)?/g;

interface PathMatch {
  raw: string;
  startIdx: number;
  endIdx: number;
  line: number;
  col: number;
}

function findPathMatches(source: string): PathMatch[] {
  const out: PathMatch[] = [];
  PATH_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = PATH_RE.exec(source)) !== null) {
    out.push({
      raw: m[1],
      startIdx: m.index,
      endIdx: m.index + m[0].length,
      line: m[2] ? Number.parseInt(m[2], 10) : 0,
      col: m[3] ? Number.parseInt(m[3], 10) : 0,
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
      const buffer = term.buffer.active;
      const line = buffer.getLine(bufferLineNumber - 1);
      if (!line) {
        callback(undefined);
        return;
      }
      const text = line.translateToString(true);
      const matches = findPathMatches(text);
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
        const range: IBufferRange = {
          start: { x: m.startIdx + 1, y: bufferLineNumber },
          end: { x: m.endIdx, y: bufferLineNumber },
        };
        links.push({
          range,
          text: text.slice(m.startIdx, m.endIdx),
          activate: () => {
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

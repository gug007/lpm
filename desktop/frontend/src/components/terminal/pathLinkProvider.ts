import type {
  IBufferRange,
  IDisposable,
  ILink,
  ILinkProvider,
  Terminal,
} from "@xterm/xterm";
import { FileExists } from "../../../wailsjs/go/main/App";
import { joinAbs } from "../../path";
import { openFileViewer } from "../../store/fileViewer";

// Matches paths with at least one separator and a file extension, optionally
// followed by `:line` or `:line:col`. The lookbehind enforces a token boundary
// so substrings like `xfoo/bar.ts` inside a longer word don't match.
const PATH_RE =
  /(?<![\w./-])((?:\.{1,2}\/|\/|[\w.-]+\/)[\w./-]*\.[a-zA-Z][\w]{0,4})(?::(\d+)(?::(\d+))?)?/g;

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

async function safeFileExists(absPath: string): Promise<boolean> {
  try {
    return await FileExists(absPath);
  } catch {
    return false;
  }
}

export interface PathLinkProviderOptions {
  // Resolved at click time so updating session.cwd doesn't require re-registering.
  // Used for resolving relative paths and as the working dir for git operations
  // in the file viewer modal.
  getCwd: () => string;
}

// Cap on cached existence checks. Long-running terminals can produce thousands
// of distinct path-shaped strings; we don't want the cache to grow forever.
// FIFO eviction is fine — the misses just re-issue a Wails call.
const EXISTS_CACHE_MAX = 1000;

export function registerPathLinkProvider(
  term: Terminal,
  opts: PathLinkProviderOptions,
): IDisposable {
  // xterm calls provideLinks repeatedly during hover and refresh; cache so we
  // only issue one Wails call per absolute path per session.
  const existsCache = new Map<string, Promise<boolean>>();
  const checkExists = (absPath: string): Promise<boolean> => {
    let p = existsCache.get(absPath);
    if (!p) {
      p = safeFileExists(absPath);
      if (existsCache.size >= EXISTS_CACHE_MAX) {
        // Drop the oldest insertion (Map preserves insertion order).
        const oldestKey = existsCache.keys().next().value;
        if (oldestKey !== undefined) existsCache.delete(oldestKey);
      }
      existsCache.set(absPath, p);
    }
    return p;
  };

  const provider: ILinkProvider = {
    provideLinks(bufferLineNumber, callback) {
      const cwd = opts.getCwd();
      // Without a cwd we can't resolve relative paths, and absolute matches
      // are rare enough that issuing N stat calls per render isn't worth it.
      if (!cwd) {
        callback(undefined);
        return;
      }
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
      Promise.all(
        matches.map(async (m): Promise<ILink | null> => {
          const abs = joinAbs(cwd, m.raw);
          if (!(await checkExists(abs))) return null;
          const range: IBufferRange = {
            start: { x: m.startIdx + 1, y: bufferLineNumber },
            end: { x: m.endIdx, y: bufferLineNumber },
          };
          return {
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
          };
        }),
      ).then((links) => {
        callback(links.filter((l): l is ILink => l !== null));
      });
    },
  };
  return term.registerLinkProvider(provider);
}

import type { LineMatch, SearchFilters, SearchOptions } from "../../components/files/fileSearch";
import type { CommandMap } from "../backend";
import { isBinary } from "../seed/sample";
import { tree, write } from "./files";
import { project, projectAt } from "./state";

type Options = Partial<SearchOptions>;
type Filters = Partial<SearchFilters>;

interface UndoEntry {
  abs: string;
  rel: string;
  before: string;
  after: string;
}

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function pattern(query: string, options: Options): RegExp {
  const source = options.regex ? query : escape(query);
  return new RegExp(options.wholeWord ? `\\b(?:${source})\\b` : source, options.matchCase ? "gu" : "giu");
}

// The backend's globs: a plain name or path also takes the folder, a glob
// without a slash matches at any depth.
function globTest(glob: string): RegExp {
  const body = glob
    .split(/(\*\*\/|\*\*|\*|\?|\{[^}]*\})/)
    .map((part) => {
      if (part === "**/") return "(?:.*/)?";
      if (part === "**") return ".*";
      if (part === "*") return "[^/]*";
      if (part === "?") return "[^/]";
      if (part.startsWith("{")) return `(?:${part.slice(1, -1).split(",").map(escape).join("|")})`;
      return escape(part);
    })
    .join("");
  return new RegExp(glob.includes("/") ? `^${body}$` : `(?:^|/)${body}$`);
}

function expand(raw: string): RegExp[] {
  const folder = raw.trim().endsWith("/");
  const p = raw.trim().replace(/^(\.\/)+/, "").replace(/\/+$/, "");
  if (!p) return [];
  if (/[*?[{]/.test(p) && !folder) return [globTest(p)];
  const under = globTest(p.includes("/") ? `${p}/**` : `**/${p}/**`);
  return folder ? [under] : [globTest(p), under];
}

function keeps(path: string, filters: Filters): boolean {
  const include = (filters.include ?? []).flatMap(expand);
  const exclude = (filters.exclude ?? []).flatMap(expand);
  if (exclude.some((re) => re.test(path))) return false;
  return include.length === 0 || include.some((re) => re.test(path));
}

function replacementOf(found: string, re: RegExp, replacement: string, regex: boolean): string {
  return regex ? found.replace(new RegExp(re.source, re.flags.replace("g", "")), replacement) : replacement;
}

function lineMatches(text: string, re: RegExp, line: number, replacement: string | null, regex: boolean): LineMatch[] {
  const out: LineMatch[] = [];
  for (const m of text.matchAll(re)) {
    if (!m[0]) continue;
    const lead = text.slice(0, m.index).trimStart();
    const before = lead.length > 30 ? `…${lead.slice(-30)}` : lead;
    const hit: LineMatch = {
      line,
      col: m.index + 1,
      len: m[0].length,
      text: (before + text.slice(m.index)).slice(0, 200),
      start: before.length,
    };
    if (replacement !== null) hit.replacement = replacementOf(m[0], re, replacement, regex);
    out.push(hit);
  }
  return out;
}

function search(root: unknown, query: string, options: Options, filters: Filters, replacement: string | null) {
  const files: { path: string; matches: LineMatch[] }[] = [];
  if (!query) return { files, truncated: false, invalid: null };
  let re: RegExp;
  try {
    re = pattern(query, options);
  } catch (err) {
    return { files, truncated: false, invalid: { field: "query", message: err instanceof Error ? err.message : String(err) } };
  }
  const all = tree(root);
  for (const path of Object.keys(all).sort()) {
    if (isBinary(path) || !keeps(path, filters)) continue;
    const matches = all[path]
      .split("\n")
      .flatMap((raw, i) => lineMatches(raw.replace(/\r$/, ""), re, i + 1, replacement, !!options.regex));
    if (matches.length > 0) files.push({ path, matches });
  }
  return { files, truncated: false, invalid: null };
}

// The last replace under each Search view, for its Undo.
const undoable = new Map<string, UndoEntry[]>();
const undoKey = (args: Record<string, unknown>) => `${args.root}\0${args.token}`;

function rootOf(root: unknown): string {
  const name = String(root);
  return project(name)?.root ?? projectAt(name)?.root ?? name;
}

function replace(args: Record<string, unknown>) {
  const options = (args.options ?? {}) as Options;
  const re = pattern(String(args.query ?? ""), options);
  const at = args.at as { line: number; col: number } | null;
  const all = tree(args.root);
  const done: UndoEntry[] = [];
  let replaced = 0;
  for (const rel of (args.paths ?? []) as string[]) {
    const before = all[rel];
    if (before === undefined || isBinary(rel)) continue;
    let count = 0;
    const after = before
      .split("\n")
      .map((line, i) => {
        if (at && at.line !== i + 1) return line;
        return line.replace(re, (found: string, ...rest: unknown[]) => {
          const offset = rest[rest.length - 2] as number;
          if (at && at.col !== offset + 1) return found;
          count++;
          return replacementOf(found, re, String(args.replacement ?? ""), !!options.regex);
        });
      })
      .join("\n");
    if (count === 0) continue;
    const abs = `${rootOf(args.root)}/${rel}`;
    write(abs, after);
    replaced += count;
    done.push({ abs, rel, before, after });
  }
  undoable.set(undoKey(args), done);
  return { replaced, files: done.length, skipped: [], undoable: done.length > 0 };
}

function undo(args: Record<string, unknown>) {
  const key = undoKey(args);
  const done = undoable.get(key);
  if (!done) throw new Error("This replace can no longer be undone");
  undoable.delete(key);
  const all = tree(args.root);
  const restored = done.filter((d) => all[d.rel] === d.after);
  for (const d of restored) write(d.abs, d.before);
  return { restored: restored.length, skipped: [] };
}

export const fileSearchCommands: CommandMap = {
  search_files: ({ root, query, options, filters, replacement }) =>
    search(
      root,
      String(query ?? ""),
      (options ?? {}) as Options,
      (filters ?? {}) as Filters,
      typeof replacement === "string" ? replacement : null,
    ),
  cancel_file_search: () => null,
  replace_in_files: (args) => replace(args),
  undo_replace: (args) => undo(args),
};

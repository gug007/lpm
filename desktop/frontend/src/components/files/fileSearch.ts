export interface SearchOptions {
  matchCase: boolean;
  wholeWord: boolean;
  regex: boolean;
}

// Globs that narrow the files searched, such as `src` or `*.ts`.
export interface SearchFilters {
  include: string[];
  exclude: string[];
}

export type SearchField = "query" | "include" | "exclude";

// One occurrence. `col` (1-based) and `len` count UTF-16 units, as the editor
// does; `text` is the line around it, the occurrence `start` units in.
export interface LineMatch {
  line: number;
  col: number;
  len: number;
  text: string;
  start: number;
  // What a replace would put in its place, while the replace field is open.
  replacement?: string;
}

export interface FileMatches {
  path: string;
  matches: LineMatch[];
}

export interface SearchResult {
  files: FileMatches[];
  // Cut off at the cap or the time limit: more lines may match.
  truncated: boolean;
}

export type SearchRow =
  | { kind: "file"; key: string; path: string; count: number; collapsed: boolean }
  | { kind: "match"; key: string; path: string; match: LineMatch };

// "src, *.ts" as the globs it lists.
export function globList(text: string): string[] {
  return text
    .split(",")
    .map((glob) => glob.trim())
    .filter(Boolean);
}

export function matchKey(path: string, match: Pick<LineMatch, "line" | "col">): string {
  return `${path}:${match.line}:${match.col}`;
}

// The list the results show: each file, then its occurrences unless collapsed.
export function searchRows(files: FileMatches[], collapsed: ReadonlySet<string>): SearchRow[] {
  const rows: SearchRow[] = [];
  for (const { path, matches } of files) {
    const closed = collapsed.has(path);
    rows.push({ kind: "file", key: path, path, count: matches.length, collapsed: closed });
    if (closed) continue;
    for (const match of matches) rows.push({ kind: "match", key: matchKey(path, match), path, match });
  }
  return rows;
}

const plural = (n: number, one: string, many: string) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

export function resultSummary({ files, truncated }: SearchResult): string {
  if (files.length === 0) return "No results";
  const total = files.reduce((sum, f) => sum + f.matches.length, 0);
  const text = `${plural(total, "result", "results")} in ${plural(files.length, "file", "files")}`;
  return truncated ? `${text} · the first ones found` : text;
}

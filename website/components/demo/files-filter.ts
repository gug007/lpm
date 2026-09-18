// Ranking for the tree's "Filter files" box: the best matches from the project
// index, which the rail then shows under their folders. Space-separated terms
// must all appear in the path; the last term decides the rank, the way a
// quick-open box narrows as you type. Ported from the app's filesFilter.ts.
import { basename, type Item } from "./files-model";

export interface IndexEntry extends Item {
  lower: string;
  lowerName: string;
}

export const FILTER_LIMIT = 200;

export function indexEntry(path: string, isDir: boolean): IndexEntry {
  const lower = path.toLowerCase();
  return { path, isDir, lower, lowerName: basename(lower) };
}

/** The characters of `q` appear in `text` in order — quick-open's fallback. */
export function isSubsequence(q: string, text: string): boolean {
  let i = 0;
  for (let j = 0; j < text.length && i < q.length; j++) {
    if (text[j] === q[i]) i++;
  }
  return i === q.length;
}

// Lower is better; null is no match.
function rankOf(entry: IndexEntry, head: string[], last: string): number | null {
  for (const term of head) {
    if (!entry.lower.includes(term)) return null;
  }
  if (entry.lowerName.startsWith(last)) return 0;
  if (entry.lowerName.includes(last)) return 1;
  if (entry.lower.includes(last)) return 2;
  if (head.length === 0 && isSubsequence(last, entry.lower)) return 3;
  return null;
}

// Within a rank: files before folders, then the shortest path.
function compare(a: IndexEntry, b: IndexEntry): number {
  return (
    Number(a.isDir) - Number(b.isDir) ||
    a.path.length - b.path.length ||
    (a.path < b.path ? -1 : a.path > b.path ? 1 : 0)
  );
}

export function rankFiles(
  index: readonly IndexEntry[],
  query: string,
  limit = FILTER_LIMIT,
): IndexEntry[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [];
  const head = terms.slice(0, -1);
  const last = terms[terms.length - 1];
  const buckets: IndexEntry[][] = [[], [], [], []];
  for (const entry of index) {
    const rank = rankOf(entry, head, last);
    if (rank !== null) buckets[rank].push(entry);
  }
  const out: IndexEntry[] = [];
  for (const bucket of buckets) {
    if (out.length >= limit) break;
    bucket.sort(compare);
    for (const entry of bucket) {
      if (out.length >= limit) break;
      out.push(entry);
    }
  }
  return out;
}

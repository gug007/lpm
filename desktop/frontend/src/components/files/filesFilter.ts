// Ranking for the tree's "Filter files" box: a flat, ranked slice of the
// project index rather than a pruned tree, so a match never hides under a
// collapsed folder. Space-separated terms must all appear in the path; the last
// term decides the rank, the way a quick-open box narrows as you type.

export interface IndexEntry {
  path: string;
  isDir: boolean;
}

export const FILTER_LIMIT = 200;

function baseName(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

// The characters of `q` appear in `text` in order — quick-open's fallback.
export function isSubsequence(q: string, text: string): boolean {
  let i = 0;
  for (let j = 0; j < text.length && i < q.length; j++) {
    if (text[j] === q[i]) i++;
  }
  return i === q.length;
}

// Lower is better; null is no match.
function rankOf(entry: IndexEntry, terms: string[]): number | null {
  const path = entry.path.toLowerCase();
  const name = baseName(path);
  for (const term of terms.slice(0, -1)) {
    if (!path.includes(term)) return null;
  }
  const last = terms[terms.length - 1];
  if (name.startsWith(last)) return 0;
  if (name.includes(last)) return 1;
  if (path.includes(last)) return 2;
  if (terms.length === 1 && isSubsequence(last, path)) return 3;
  return null;
}

export function rankFiles(index: IndexEntry[], query: string, limit = FILTER_LIMIT): IndexEntry[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [];
  const scored: { entry: IndexEntry; rank: number }[] = [];
  for (const entry of index) {
    const rank = rankOf(entry, terms);
    if (rank !== null) scored.push({ entry, rank });
  }
  scored.sort(
    (a, b) =>
      a.rank - b.rank ||
      Number(a.entry.isDir) - Number(b.entry.isDir) ||
      a.entry.path.length - b.entry.path.length ||
      (a.entry.path < b.entry.path ? -1 : a.entry.path > b.entry.path ? 1 : 0),
  );
  return scored.slice(0, limit).map((s) => s.entry);
}

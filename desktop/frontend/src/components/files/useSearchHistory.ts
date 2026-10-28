import { useCallback, useRef, useState } from "react";
import type { SearchOptions } from "./fileSearch";

const LIMIT = 30;

// One search as typed: the query with its toggles and file filters.
export interface SearchEntry {
  query: string;
  options: SearchOptions;
  include: string;
  exclude: string;
}

const historyKey = (root: string) => `lpm:filesSearchHistory:${root}`;

function read(root: string): SearchEntry[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(historyKey(root)) ?? "[]");
    return Array.isArray(parsed) ? (parsed as SearchEntry[]).filter((e) => typeof e?.query === "string") : [];
  } catch {
    return [];
  }
}

function sameEntry(a: SearchEntry, b: SearchEntry): boolean {
  return (
    a.query === b.query &&
    a.include === b.include &&
    a.exclude === b.exclude &&
    a.options.matchCase === b.options.matchCase &&
    a.options.wholeWord === b.options.wholeWord &&
    a.options.regex === b.options.regex
  );
}

// The project's recent searches, newest first, and ↑ / ↓ through them from the
// field. Stepping away from what was typed keeps it, so ↓ past the newest
// entry brings it back.
export function useSearchHistory(root: string, current: SearchEntry, apply: (entry: SearchEntry) => void) {
  const [entries, setEntries] = useState(() => read(root));
  const [index, setIndex] = useState<number | null>(null);
  const draft = useRef<SearchEntry | null>(null);
  const currentRef = useRef(current);
  currentRef.current = current;

  // Saves the search as it stands.
  const remember = useCallback(() => {
    const entry = currentRef.current;
    if (!entry.query) return;
    setEntries((prev) => {
      if (prev[0] && sameEntry(prev[0], entry)) return prev;
      const next = [entry, ...prev.filter((e) => !sameEntry(e, entry))].slice(0, LIMIT);
      try {
        localStorage.setItem(historyKey(root), JSON.stringify(next));
      } catch {
        // History is a convenience; a full or blocked store just forgets.
      }
      return next;
    });
  }, [root]);

  // Whether ↑ found an older search to show.
  const older = (): boolean => {
    let next = index === null ? 0 : index + 1;
    if (index === null && entries[0] && sameEntry(entries[0], current)) next = 1;
    if (next >= entries.length) return entries.length > 0;
    if (index === null) draft.current = current;
    setIndex(next);
    apply(entries[next]);
    return true;
  };

  // Whether ↓ stepped toward the newest; false when not browsing.
  const newer = (): boolean => {
    if (index === null) return false;
    if (index === 0) {
      if (draft.current) apply(draft.current);
      setIndex(null);
    } else {
      setIndex(index - 1);
      apply(entries[index - 1]);
    }
    return true;
  };

  const stopBrowsing = useCallback(() => setIndex(null), []);

  return { remember, older, newer, stopBrowsing };
}

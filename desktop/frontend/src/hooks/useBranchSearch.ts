import { useEffect, useState } from "react";
import { SearchBranches } from "../../bridge/commands";
import { main } from "../../bridge/models";

const SEARCH_DEBOUNCE_MS = 120;

// Returns null while idle so callers can fall back to a cached list;
// returns an array (possibly empty) once results arrive.
export function useBranchSearch(
  projectPath: string,
  query: string,
  enabled: boolean,
  filter?: (b: main.Branch) => boolean,
): main.Branch[] | null {
  const [results, setResults] = useState<main.Branch[] | null>(null);

  useEffect(() => {
    if (!enabled || !query) {
      setResults(null);
      return;
    }
    let cancelled = false;
    const t = setTimeout(() => {
      SearchBranches(projectPath, query)
        .then((res) => {
          if (cancelled) return;
          setResults(filter ? res.filter(filter) : res);
        })
        .catch(() => { if (!cancelled) setResults([]); });
    }, SEARCH_DEBOUNCE_MS);
    return () => { cancelled = true; clearTimeout(t); };
  }, [enabled, query, projectPath, filter]);

  return results;
}

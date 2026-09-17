import { useCallback, useEffect, useRef, useState } from "react";
import { ListDirFiles } from "../../../bridge/commands";
import { useGitChanged } from "../../hooks/useGitChanged";
import { indexEntry, type IndexEntry } from "./filesFilter";

// Refetch at most once per window: an agent mid-refactor fires a change every
// few hundred milliseconds, and the walk is the expensive part.
const REFRESH_DELAY_MS = 1500;

// The flat project index behind "Filter files": the same walk the composer's
// @-mention picker uses, fetched the first time a filter is typed and refetched
// (debounced) as the project changes while a filter is live. null until then.
export function useFileIndex(root: string, wanted: boolean, active: boolean): IndexEntry[] | null {
  const [index, setIndex] = useState<IndexEntry[] | null>(null);
  const wantedRef = useRef(wanted);
  wantedRef.current = wanted;
  const staleRef = useRef(true);
  const inflightRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchIndex = useCallback(async () => {
    if (inflightRef.current) return;
    inflightRef.current = true;
    staleRef.current = false;
    try {
      const raw = (await ListDirFiles(root)) as { path: string; isDir: boolean }[];
      setIndex(Array.isArray(raw) ? raw.map((e) => indexEntry(e.path, !!e.isDir)) : []);
    } catch {
      staleRef.current = true;
      setIndex([]);
    }
    inflightRef.current = false;
  }, [root]);

  useEffect(() => {
    if (wanted && staleRef.current) void fetchIndex();
  }, [wanted, fetchIndex]);

  const onChanged = useCallback(() => {
    staleRef.current = true;
    if (!wantedRef.current) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      if (wantedRef.current) void fetchIndex();
    }, REFRESH_DELAY_MS);
  }, [fetchIndex]);
  useGitChanged(root, onChanged, active);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  return index;
}

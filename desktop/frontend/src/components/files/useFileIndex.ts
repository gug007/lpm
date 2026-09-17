import { useCallback, useEffect, useRef, useState } from "react";
import { ListDirFiles } from "../../../bridge/commands";
import { useGitChanged } from "../../hooks/useGitChanged";
import type { IndexEntry } from "./filesFilter";

// Refetch at most once per window: an agent mid-refactor fires a change every
// few hundred milliseconds, and the walk is the expensive part.
const REFRESH_DELAY_MS = 1500;

// The flat project index behind "Filter files": the same walk the composer's
// @-mention picker uses, fetched the first time a filter is typed and refetched
// (debounced) as the project changes while a filter is live.
export function useFileIndex(root: string, wanted: boolean) {
  const [index, setIndex] = useState<IndexEntry[] | null>(null);
  const [loading, setLoading] = useState(false);
  const wantedRef = useRef(wanted);
  wantedRef.current = wanted;
  const staleRef = useRef(true);
  const inflightRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const epochRef = useRef(0);

  const fetchIndex = useCallback(async () => {
    if (inflightRef.current) return;
    inflightRef.current = true;
    staleRef.current = false;
    const epoch = epochRef.current;
    setLoading(true);
    let next: IndexEntry[] = [];
    try {
      const raw = (await ListDirFiles(root)) as { path: string; isDir: boolean }[];
      next = Array.isArray(raw) ? raw.map((e) => ({ path: e.path, isDir: !!e.isDir })) : [];
    } catch {
      staleRef.current = true;
    }
    inflightRef.current = false;
    if (epoch !== epochRef.current) return;
    setIndex(next);
    setLoading(false);
  }, [root]);

  const onChanged = useCallback(() => {
    staleRef.current = true;
    if (!wantedRef.current) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      if (wantedRef.current) void fetchIndex();
    }, REFRESH_DELAY_MS);
  }, [fetchIndex]);
  useGitChanged(root, onChanged);

  useEffect(() => {
    epochRef.current += 1;
    staleRef.current = true;
    inflightRef.current = false;
    setIndex(null);
    setLoading(false);
  }, [root]);

  useEffect(() => {
    if (wanted && staleRef.current) void fetchIndex();
  }, [wanted, fetchIndex]);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  return { index, loading };
}

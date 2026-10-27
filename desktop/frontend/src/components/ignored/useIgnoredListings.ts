import { useCallback, useEffect, useRef, useState } from "react";
import { listIgnored, type Listings, type SyncPair } from "./ignoredSyncApi";

export interface IgnoredListings {
  root: Listings | null;
  loaded: Record<string, Listings>;
  loadingDirs: ReadonlySet<string>;
  error: string | null;
  loadDir: (path: string) => void;
  reload: () => void;
}

const pairsKey = (project: string, pairs: SyncPair[]) =>
  [project, ...pairs.map((p) => `${p.slug}\n${p.remoteRoot}`)].join("\n");

/// Every computer's listing of a project: the ignored entries first, then each
/// ignored folder's children the first time it is opened.
export function useIgnoredListings(project: string, pairs: SyncPair[]): IgnoredListings {
  const [root, setRoot] = useState<Listings | null>(null);
  const [loaded, setLoaded] = useState<Record<string, Listings>>({});
  const [loadingDirs, setLoadingDirs] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [round, setRound] = useState(0);
  const key = pairsKey(project, pairs);
  const current = useRef(key);
  current.current = key;
  const latest = useRef(pairs);
  latest.current = pairs;

  useEffect(() => {
    let alive = true;
    setRoot(null);
    setLoaded({});
    setError(null);
    listIgnored(project, latest.current, "").then(
      (res) => {
        if (!alive) return;
        const listings = [res.here, ...Object.values(res.there)];
        const failed = listings.find((l) => l.error)?.error;
        if (failed && listings.every((l) => !l.entries.length)) setError(failed);
        else setRoot(res);
      },
      (err) => alive && setError(String(err)),
    );
    return () => {
      alive = false;
    };
    // `key` stands for `project` and `pairs`, which is rebuilt on every render.
  }, [key, round]);

  const loadDir = useCallback(
    (path: string) => {
      const asked = current.current;
      setLoadingDirs((s) => new Set(s).add(path));
      listIgnored(project, latest.current, path)
        .then(
          (res) => {
            if (current.current === asked) setLoaded((l) => ({ ...l, [path]: res }));
          },
          () => {},
        )
        .finally(() =>
          setLoadingDirs((s) => {
            const next = new Set(s);
            next.delete(path);
            return next;
          }),
        );
    },
    [project],
  );

  const reload = useCallback(() => setRound((r) => r + 1), []);
  return { root, loaded, loadingDirs, error, loadDir, reload };
}

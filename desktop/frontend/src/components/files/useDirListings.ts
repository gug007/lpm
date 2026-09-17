import { useCallback, useEffect, useRef, useState } from "react";
import { ListDirEntries } from "../../../bridge/commands";
import { useGitChanged } from "../../hooks/useGitChanged";
import { foldersTouchedBy, sortEntries, type DirEntry, type Listing } from "./treeModel";

// One listing per opened folder, fetched on demand and kept fresh from the
// project watcher. A hidden tab defers its refresh until it is shown again.
export function useDirListings(root: string, active: boolean) {
  const [listings, setListings] = useState<ReadonlyMap<string, Listing>>(() => new Map());
  const listingsRef = useRef(listings);
  listingsRef.current = listings;
  const activeRef = useRef(active);
  activeRef.current = active;
  const staleRef = useRef(false);
  const pendingRef = useRef(new Set<string>());
  const againRef = useRef(new Set<string>());
  // Bumped when the root changes so a late reply for the old project is dropped.
  const epochRef = useRef(0);
  const loadRef = useRef<(dir: string) => Promise<void>>(async () => {});

  const patch = useCallback((dir: string, next: Listing) => {
    setListings((prev) => {
      const map = new Map(prev);
      map.set(dir, next);
      return map;
    });
  }, []);

  // Fetch one folder. An existing listing is refreshed in place, so its rows
  // stay on screen until the new ones land; a fetch already in flight is asked
  // to run once more when it returns rather than doubled up.
  const load = useCallback(
    async (dir: string) => {
      if (pendingRef.current.has(dir)) {
        againRef.current.add(dir);
        return;
      }
      pendingRef.current.add(dir);
      const current = listingsRef.current.get(dir);
      if (!current || current.status === "error") patch(dir, { status: "loading" });
      const epoch = epochRef.current;
      let next: Listing;
      try {
        const raw = (await ListDirEntries(root, dir)) as DirEntry[];
        next = { status: "ready", entries: sortEntries(Array.isArray(raw) ? raw : []) };
      } catch (err) {
        next = { status: "error", message: err instanceof Error ? err.message : String(err) };
      }
      pendingRef.current.delete(dir);
      if (epoch !== epochRef.current) return;
      patch(dir, next);
      if (againRef.current.delete(dir)) void loadRef.current(dir);
    },
    [root, patch],
  );
  loadRef.current = load;

  // Fetch only what isn't known yet — for revealing a path's ancestors.
  const ensure = useCallback(
    (dir: string) => {
      if (!listingsRef.current.has(dir) && !pendingRef.current.has(dir)) void load(dir);
    },
    [load],
  );

  // Re-list the folders a change could have touched: the changed files' own
  // folders and everything above them. An unknown change re-lists every loaded
  // folder.
  const refresh = useCallback((changed: string[] | null) => {
    const touched = changed === null ? null : new Set(changed.flatMap(foldersTouchedBy));
    for (const dir of listingsRef.current.keys()) {
      if (!touched || touched.has(dir)) void loadRef.current(dir);
    }
  }, []);

  const onChanged = useCallback(
    (changed: string[] | null) => {
      if (!activeRef.current) {
        staleRef.current = true;
        return;
      }
      refresh(changed);
    },
    [refresh],
  );
  useGitChanged(root, onChanged);

  useEffect(() => {
    if (!active || !staleRef.current) return;
    staleRef.current = false;
    refresh(null);
  }, [active, refresh]);

  useEffect(() => {
    epochRef.current += 1;
    pendingRef.current.clear();
    againRef.current.clear();
    staleRef.current = false;
    const empty = new Map<string, Listing>();
    listingsRef.current = empty;
    setListings(empty);
  }, [root]);

  useEffect(() => {
    if (active && root) ensure("");
  }, [active, root, ensure]);

  return { listings, load, ensure, refresh };
}

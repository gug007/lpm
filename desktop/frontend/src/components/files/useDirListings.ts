import { useCallback, useEffect, useRef, useState } from "react";
import { ListDirEntries } from "../../../bridge/commands";
import { useGitChanged } from "../../hooks/useGitChanged";
import {
  foldersTouchedBy,
  sameEntries,
  sortEntries,
  type DirEntry,
  type Listing,
} from "./treeModel";

function isIgnoreFile(path: string): boolean {
  return path === ".gitignore" || path.endsWith("/.gitignore");
}

// One listing per open folder, fetched on demand and kept fresh from the
// project watcher; a hidden tab catches up when it is shown again.
export function useDirListings(root: string, active: boolean) {
  const [listings, setListings] = useState<ReadonlyMap<string, Listing>>(() => new Map());
  const listingsRef = useRef(listings);
  listingsRef.current = listings;
  const pendingRef = useRef(new Set<string>());
  const againRef = useRef(new Set<string>());

  // Replace one folder's listing; an unchanged one keeps its identity so the
  // rows built from it don't re-render.
  const patch = useCallback((dir: string, next: Listing) => {
    setListings((prev) => {
      const current = prev.get(dir);
      if (
        current?.status === "ready" &&
        next.status === "ready" &&
        sameEntries(current.entries, next.entries)
      ) {
        return prev;
      }
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
      let next: Listing;
      try {
        const raw = (await ListDirEntries(root, dir)) as DirEntry[];
        next = { status: "ready", entries: sortEntries(Array.isArray(raw) ? raw : []) };
      } catch (err) {
        next = { status: "error", message: err instanceof Error ? err.message : String(err) };
      }
      pendingRef.current.delete(dir);
      patch(dir, next);
      if (againRef.current.delete(dir)) void load(dir);
    },
    [root, patch],
  );

  // Fetch only what isn't known yet — for revealing a path's ancestors.
  const ensure = useCallback(
    (dir: string) => {
      if (!listingsRef.current.has(dir) && !pendingRef.current.has(dir)) void load(dir);
    },
    [load],
  );

  // A collapsed folder's listing is dropped: nothing shows it, the watcher
  // needn't keep it fresh, and opening it again fetches it anew.
  const forget = useCallback((dir: string) => {
    setListings((prev) => {
      if (!prev.has(dir)) return prev;
      const map = new Map(prev);
      map.delete(dir);
      return map;
    });
  }, []);

  // Re-list what a change can have altered: the changed paths' own folders
  // and their parents. An unknown change, or an edited .gitignore, whose
  // rules reach every folder below it, re-lists every open folder.
  const onChanged = useCallback(
    (changed: string[] | null) => {
      const touched =
        changed === null || changed.some(isIgnoreFile)
          ? null
          : new Set(changed.flatMap(foldersTouchedBy));
      for (const dir of listingsRef.current.keys()) {
        if (!touched || touched.has(dir)) void load(dir);
      }
    },
    [load],
  );
  useGitChanged(root, onChanged, active);

  useEffect(() => {
    if (active && root) ensure("");
  }, [active, root, ensure]);

  return { listings, load, ensure, forget };
}

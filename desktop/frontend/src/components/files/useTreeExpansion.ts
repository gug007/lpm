import { useCallback, useState } from "react";
import type { useDirListings } from "./useDirListings";

type Listings = Pick<ReturnType<typeof useDirListings>, "load" | "ensure" | "forget">;

// Which folders the rail shows open: in the folder tree each opened folder is
// listed and a closed one's listing dropped; the git view's folders are all
// open but the ones folded.
export function useTreeExpansion(changesOnly: boolean, { load, ensure, forget }: Listings) {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());

  const expandDirs = useCallback(
    (dirs: string[]) => {
      setExpanded((prev) => {
        if (dirs.every((dir) => prev.has(dir))) return prev;
        const next = new Set(prev);
        for (const dir of dirs) next.add(dir);
        return next;
      });
      for (const dir of dirs) ensure(dir);
    },
    [ensure],
  );

  const uncollapse = useCallback((dirs: string[]) => {
    setCollapsed((prev) => {
      if (!dirs.some((dir) => prev.has(dir))) return prev;
      const next = new Set(prev);
      for (const dir of dirs) next.delete(dir);
      return next;
    });
  }, []);

  const toggleDir = useCallback(
    (path: string) => {
      if (changesOnly) {
        setCollapsed((prev) => {
          const next = new Set(prev);
          if (!next.delete(path)) next.add(path);
          return next;
        });
        return;
      }
      if (expanded.has(path)) {
        setExpanded((prev) => {
          const next = new Set(prev);
          next.delete(path);
          return next;
        });
        forget(path);
        return;
      }
      setExpanded((prev) => new Set(prev).add(path));
      void load(path);
    },
    [changesOnly, expanded, load, forget],
  );

  return { expanded, collapsed, expandDirs, uncollapse, toggleDir };
}

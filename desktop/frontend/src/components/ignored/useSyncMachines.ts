import { useCallback, useEffect, useState } from "react";
import { savedList, type SavedList, type SyncPair } from "./ignoredSyncApi";

export interface SyncMachines {
  // Each computer's list by its slug, null where there is none; null while
  // they load.
  saved: Record<string, SavedList | null> | null;
  chosen: ReadonlySet<string>;
  choose: (slug: string, on: boolean) => void;
}

/// Which of the computers that hold the project the dialog syncs with: those
/// that already sync, or when none does, every one of them.
export function useSyncMachines(pairs: SyncPair[]): SyncMachines {
  const [saved, setSaved] = useState<Record<string, SavedList | null> | null>(null);
  const [chosen, setChosen] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    let alive = true;
    Promise.all(pairs.map(async (p) => [p.slug, await savedList(p).catch(() => null)] as const)).then((lists) => {
      if (!alive) return;
      const syncing = lists.filter(([, list]) => list).map(([slug]) => slug);
      setSaved(Object.fromEntries(lists));
      setChosen(new Set(syncing.length ? syncing : pairs.map((p) => p.slug)));
    });
    return () => {
      alive = false;
    };
  }, [pairs]);

  const choose = useCallback((slug: string, on: boolean) => {
    setChosen((s) => {
      const next = new Set(s);
      if (on) next.add(slug);
      else next.delete(slug);
      return next;
    });
  }, []);

  return { saved, chosen, choose };
}

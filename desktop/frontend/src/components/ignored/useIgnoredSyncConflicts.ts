import { useEffect } from "react";
import { EventsOn } from "../../../bridge/runtime";
import { toast } from "../../notifications/toast";
import { useAppStore } from "../../store/app";
import type { SyncPair } from "./ignoredSyncApi";
import { useIgnoredSyncStore } from "./ignoredSyncStore";
import { syncPairsFor } from "./syncPairs";

interface Conflict {
  project: string;
  slug: string;
  remoteRoot: string;
  machine: string;
  paths: string[];
}

/// Keeping a project's files in step found one changed on both computers:
/// nothing was replaced, and the user picks which to keep.
export function useIgnoredSyncConflicts() {
  useEffect(
    () =>
      EventsOn("ignored-sync-conflict", (c: Conflict) => {
        if (!c?.project || !c.paths?.length) return;
        const pair: SyncPair = { project: c.project, slug: c.slug, remoteRoot: c.remoteRoot, machine: c.machine };
        const what = c.paths.length === 1 ? c.paths[0] : `${c.paths.length} files`;
        toast.warning(`${what} changed on this computer and on ${c.machine}`, {
          tag: c.project,
          description: "Nothing was replaced. Pick which one to keep.",
          duration: Infinity,
          action: {
            label: "Choose",
            onClick: () => {
              const store = useIgnoredSyncStore.getState();
              const all = syncPairsFor(c.project, useAppStore.getState().projects, store.peers);
              store.open({ pairs: all.some((p) => p.slug === c.slug) ? all : [pair], focus: c.paths[0] });
            },
          },
        });
      }),
    [],
  );
}

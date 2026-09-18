import { useCallback, useState } from "react";
import { toast } from "sonner";
import { GitDiscardFiles } from "../../../bridge/commands";
import type { Item } from "./treeModel";
import type { Changes } from "./useChangedFiles";

export interface DiscardTarget {
  path: string;
  isDir: boolean;
  // The changed files the discard restores: one file, or every changed file
  // under a folder, since git only knows how to undo paths it tracks.
  paths: string[];
}

function targetOf(item: Item, changes: Changes): DiscardTarget | null {
  if (changes.status !== "ready") return null;
  const paths = changes.files
    .map((f) => f.path)
    .filter((path) => (item.isDir ? path.startsWith(`${item.path}/`) : path === item.path));
  if (paths.length === 0) return null;
  return { path: item.path, isDir: item.isDir, paths };
}

// Restoring a changed row to HEAD, confirmed first: the tree asks, the dialog
// confirms, and the watcher refreshes the list and any open buffer.
export function useFileDiscard(root: string, changes: Changes) {
  const [target, setTarget] = useState<DiscardTarget | null>(null);
  const [busy, setBusy] = useState(false);

  const request = useCallback(
    (item: Item) => {
      const next = targetOf(item, changes);
      if (next) setTarget(next);
    },
    [changes],
  );

  const cancel = useCallback(() => setTarget(null), []);

  const confirm = useCallback(async () => {
    if (!target) return;
    setBusy(true);
    try {
      await GitDiscardFiles(root, target.paths);
      toast.success(
        target.paths.length === 1
          ? `Discarded changes to ${target.path}`
          : `Discarded changes to ${target.paths.length} files in ${target.path}`,
      );
      setTarget(null);
    } catch (err: unknown) {
      toast.error(`Discard failed: ${String(err)}`);
    } finally {
      setBusy(false);
    }
  }, [root, target]);

  return { target, busy, request, cancel, confirm };
}

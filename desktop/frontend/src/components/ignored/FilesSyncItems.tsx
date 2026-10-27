import { FolderSync, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { DownloadIcon, UploadIcon } from "../icons";
import { ContextMenuItem } from "../ui/ContextMenuItem";
import { ContextMenuSeparator } from "../ui/ContextMenuSeparator";
import { ContextMenuSubmenu } from "../ui/ContextMenuSubmenu";
import { savedList, type SavedList, type SyncPair } from "./ignoredSyncApi";
import { useIgnoredSyncStore, useSyncPairs } from "./ignoredSyncStore";
import { copyOnce, keepInSync, stopSyncing } from "./quickSync";

interface FilesSyncItemsProps {
  projectName: string;
  // Project-relative, as the Files tab names it.
  path: string;
  isDir: boolean;
  // The row is ignored by git, or inside a folder that is.
  ignored: boolean;
  onClose: () => void;
}

/// The kept path that already covers `path`: itself, or a folder holding it.
function keptBy(path: string, saved: SavedList | null | undefined): string | undefined {
  if (!saved?.keep) return undefined;
  return saved.paths.find((p) => p === path || (p.endsWith("/") && path.startsWith(p)));
}

// A Files tab row's way to other computers that hold the same project: keep it
// in sync with them (ignored files only — tracked ones travel with git), send
// or get a copy once, or choose more in Sync Ignored Files.
export function FilesSyncItems({ projectName, path, isDir, ignored, onClose }: FilesSyncItemsProps) {
  const pairs = useSyncPairs(projectName);
  const [saved, setSaved] = useState<Record<string, SavedList | null>>({});
  const pairKey = pairs.map((p) => p.slug).join(",");

  useEffect(() => {
    let alive = true;
    Promise.all(pairs.map(async (p) => [p.slug, await savedList(p).catch(() => null)] as const)).then(
      (lists) => alive && setSaved(Object.fromEntries(lists)),
    );
    return () => {
      alive = false;
    };
    // `pairKey` stands for `pairs`, which is rebuilt on every render.
  }, [pairKey]);

  if (!pairs.length) return null;
  const syncPath = isDir ? `${path}/` : path;
  const run = (action: () => void) => () => {
    action();
    onClose();
  };
  const several = pairs.length > 1;
  const keepItem = (pair: SyncPair) => {
    const by = keptBy(syncPath, saved[pair.slug]);
    const icon = <RefreshCw size={14} />;
    if (by === syncPath) {
      const label = `Stop syncing with ${pair.machine}`;
      return <ContextMenuItem key={pair.slug} label={label} icon={icon} onClick={run(() => void stopSyncing(pair, syncPath))} />;
    }
    if (by) {
      const label = `Synced with ${pair.machine}`;
      return <ContextMenuItem key={pair.slug} label={label} description={`As part of ${by}`} icon={icon} onClick={onClose} disabled />;
    }
    const label = several ? pair.machine : `Keep in sync with ${pair.machine}`;
    return <ContextMenuItem key={pair.slug} label={label} icon={icon} onClick={run(() => void keepInSync([pair], syncPath))} />;
  };
  const notYet = pairs.filter((p) => !keptBy(syncPath, saved[p.slug]));
  const copyItem = (pair: SyncPair, push: boolean) => (
    <ContextMenuItem
      key={pair.slug}
      label={several ? pair.machine : push ? `Send a copy to ${pair.machine}` : `Get a copy from ${pair.machine}`}
      icon={push ? <UploadIcon /> : <DownloadIcon />}
      onClick={run(() => copyOnce(pair, push ? "push" : "pull", syncPath))}
    />
  );

  return (
    <>
      <ContextMenuSeparator />
      {ignored &&
        (several ? (
          <ContextMenuSubmenu label="Keep in sync with" icon={<RefreshCw size={14} />}>
            {notYet.length > 1 && (
              <ContextMenuItem
                label="All computers"
                icon={<RefreshCw size={14} />}
                onClick={run(() => void keepInSync(notYet, syncPath))}
              />
            )}
            {pairs.map(keepItem)}
          </ContextMenuSubmenu>
        ) : (
          keepItem(pairs[0])
        ))}
      {several ? (
        <>
          <ContextMenuSubmenu label="Send a copy to" icon={<UploadIcon />}>
            {pairs.map((p) => copyItem(p, true))}
          </ContextMenuSubmenu>
          <ContextMenuSubmenu label="Get a copy from" icon={<DownloadIcon />}>
            {pairs.map((p) => copyItem(p, false))}
          </ContextMenuSubmenu>
        </>
      ) : (
        <>
          {copyItem(pairs[0], true)}
          {copyItem(pairs[0], false)}
        </>
      )}
      <ContextMenuItem
        label="Sync Ignored Files…"
        icon={<FolderSync size={14} />}
        onClick={run(() => useIgnoredSyncStore.getState().open({ pairs, focus: ignored ? syncPath : undefined }))}
      />
    </>
  );
}

import { MACHINE } from "../../machineWords";
import { toast } from "../../notifications/toast";
import { folderName } from "../../path";
import { formatBytes } from "../../syncApi";
import { copyPaths, forgetList, saveList, savedList, undoSync, type Direction, type SyncPair } from "./ignoredSyncApi";
import { doneTitle, listNames, progressLine, putBack, replacedNote } from "./syncWords";

/// Send a copy of one file or folder to the other computer, or get one from it,
/// once: the progress, the outcome and Undo all live in one toast.
export function copyOnce(pair: SyncPair, direction: Direction, path: string): void {
  const name = folderName(path) || path;
  const [from, to] =
    direction === "pull" ? [pair.machine, MACHINE.ThisMachineTitle] : [MACHINE.ThisMachineTitle, pair.machine];
  const id = crypto.randomUUID();
  const doing = direction === "push" ? `Sending ${name} to ${to}` : `Getting ${name} from ${from}`;
  toast.loading(doing, { id });

  copyPaths(id, pair, direction, [path], {
    onProgress: (p) => p.phase === "copying" && toast.loading(doing, { id, description: progressLine(p) }),
    onDone: (d) => {
      if (!d.ok && !d.files) {
        toast.error(d.cancelled ? `Stopped ${doing.toLowerCase()}` : (d.error ?? "Couldn't copy it"), { id });
        return;
      }
      if (d.unchanged) {
        toast.info(`Nothing to copy: ${name} is the same on both, or ${from} doesn't have it`, { id });
        return;
      }
      const undo = () =>
        d.batch &&
        undoSync(pair.project, [
          direction === "push" ? { batch: d.batch, slug: pair.slug, remoteRoot: pair.remoteRoot } : { batch: d.batch },
        ]).then(
          ({ restored, paused }) =>
            toast.success(putBack(restored, to), {
              description: paused ? "Keeping them in sync is paused, so they aren't copied back." : undefined,
            }),
          (err) => toast.error(String(err)),
        );
      toast.success(doneTitle(direction, d, from, to), {
        id,
        description: [formatBytes(d.bytes ?? 0), replacedNote(d.replaced ?? 0), d.ok ? "" : `stopped part way: ${d.error}`]
          .filter(Boolean)
          .join(" · "),
        action: { label: "Undo", onClick: () => void undo() },
      });
    },
  }).catch((err) => toast.error(String(err), { id }));
}

/// Add one file or folder to what this project keeps in step with each of
/// `pairs`' computers. The first round copies wherever it's missing; a file
/// that differs on two computers is asked about rather than overwritten.
export async function keepInSync(pairs: SyncPair[], path: string): Promise<void> {
  const name = folderName(path) || path;
  const kept: string[] = [];
  for (const pair of pairs) {
    try {
      const saved = await savedList(pair);
      const paths = [...new Set([...(saved?.paths ?? []), path])].sort();
      await saveList(pair, paths, true);
      kept.push(pair.machine);
    } catch (err) {
      toast.error(String(err));
    }
  }
  if (kept.length) {
    toast.success(`Keeping ${name} in sync with ${listNames(kept)}`, {
      description: "It copies over now and whenever it changes on any of them.",
    });
  }
}

export async function stopSyncing(pair: SyncPair, path: string): Promise<void> {
  const name = folderName(path) || path;
  try {
    const saved = await savedList(pair);
    const paths = (saved?.paths ?? []).filter((p) => p !== path);
    if (paths.length && saved) await saveList(pair, paths, saved.keep);
    else await forgetList(pair);
    toast(`Stopped syncing ${name} with ${pair.machine}`, {
      description: "Both computers keep the copy they have.",
    });
  } catch (err) {
    toast.error(String(err));
  }
}

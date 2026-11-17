import { useEffect, useState } from "react";
import { projectDiskSize, type ArchivedProject } from "../../projectArchive";

// What each folder measured last, so the page shows sizes at once on a second
// visit while it measures again behind them.
const measured = new Map<string, number | null>();

// Two at a time: a folder with node_modules can take seconds, and every walk
// competes for the same disk.
const PARALLEL = 2;

/** Each project's folder size: absent while it's measured, null when it can't
 *  be (an SSH project, a folder that's gone), else bytes. */
export function useProjectSizes(list: readonly ArchivedProject[]): ReadonlyMap<string, number | null> {
  const [sizes, setSizes] = useState<Map<string, number | null>>(() => new Map(measured));
  const key = list.map((p) => `${p.name}\u0000${p.isRemote}`).join("\n");

  useEffect(() => {
    let cancelled = false;
    const queue = list.filter((p) => !p.isRemote).map((p) => p.name);
    const remote = list.filter((p) => p.isRemote).map((p) => p.name);
    if (remote.length > 0) {
      setSizes((prev) => {
        const next = new Map(prev);
        remote.forEach((name) => next.set(name, null));
        return next;
      });
    }
    const worker = async () => {
      for (let name = queue.shift(); name !== undefined && !cancelled; name = queue.shift()) {
        const bytes = await projectDiskSize(name).catch(() => null);
        measured.set(name, bytes);
        if (!cancelled) setSizes((prev) => new Map(prev).set(name, bytes));
      }
    };
    void Promise.all(Array.from({ length: PARALLEL }, worker));
    return () => {
      cancelled = true;
    };
    // `key` stands for `list`: a new array with the same projects measures nothing new.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return sizes;
}

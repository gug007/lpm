import { useEffect, useState } from "react";
import { projectSize, type ArchivedProject, type ProjectSize } from "../../projectArchive";

// What each folder measured last, so the page shows sizes at once on a second
// visit while it measures again behind them.
const measured = new Map<string, ProjectSize | null>();

// Two at a time: a folder with node_modules can take seconds, and every walk
// competes for the same disk.
const PARALLEL = 2;

/** Each project's folder size: absent while it's measured, null when it can't
 *  be (an SSH project, a folder that's gone). `remeasure` measures them again,
 *  after space was freed. */
export function useProjectSizes(list: readonly ArchivedProject[]): {
  sizes: ReadonlyMap<string, ProjectSize | null>;
  remeasure: () => void;
} {
  const [sizes, setSizes] = useState<Map<string, ProjectSize | null>>(() => new Map(measured));
  const [round, setRound] = useState(0);
  const key = `${round}\n${list.map((p) => `${p.name}\u0000${p.isRemote}`).join("\n")}`;

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
        const bytes = await projectSize(name).catch(() => null);
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

  return { sizes, remeasure: () => setRound((n) => n + 1) };
}

import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { DuplicateSpace } from "../../bridge/commands";
import { isLow, type DuplicateSpaceInfo } from "../diskSpace";
import { formatBytes } from "../syncApi";
import { HardDriveIcon } from "./icons";

/** The Duplicate dialog's footer note: what the copies take and the room left
 *  where they go, amber when they'd leave the disk low. */
export function DuplicateSpaceLine({
  project,
  worktree,
  count,
  noun,
  where,
}: {
  // The project the copies are made from: where they go is beside it.
  project: string;
  worktree: boolean;
  count: number;
  noun: string;
  // "this Mac", or the paired computer's name.
  where: string;
}) {
  const [space, setSpace] = useState<DuplicateSpaceInfo | null>(null);

  useEffect(() => {
    let current = true;
    setSpace(null);
    if (!project) return;
    DuplicateSpace(project, worktree)
      .then((s) => current && setSpace(s))
      .catch(() => current && setSpace(null));
    return () => {
      current = false;
    };
  }, [project, worktree]);

  if (!space) return null;
  const need = (space.bytes ?? 0) * count;
  const low = isLow(space, need);
  const free = `${low ? "only " : ""}${formatBytes(space.free)} free on ${where}`;
  const text =
    low && need > space.free
      ? `Needs about ${formatBytes(need)}, but only ${formatBytes(space.free)} is free on ${where}`
      : space.bytes === null
        ? `Shares unchanged files · ${free}`
        : `About ${formatBytes(need)}${count > 1 ? ` for ${count} ${noun}` : ""} · ${free}`;

  return (
    <p
      className={`mr-auto flex min-w-0 items-center gap-1.5 self-center text-[12px] ${
        low ? "text-[var(--accent-amber-text)]" : "text-[var(--text-muted)]"
      }`}
      title={
        space.bytes === null
          ? "This disk clones files, so a copy takes room only as it changes."
          : `${formatBytes(space.free)} of ${formatBytes(space.total)} is free.`
      }
    >
      {low ? <AlertTriangle size={13} className="shrink-0" /> : <HardDriveIcon size={13} />}
      <span className="truncate">{text}</span>
    </p>
  );
}

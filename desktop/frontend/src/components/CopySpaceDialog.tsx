import { useMemo, useState } from "react";
import { FreeCopySpace } from "../../bridge/commands";
import { freeableBytes } from "../diskSpace";
import { toast } from "../notifications/toast";
import { useAppStore } from "../store/app";
import { useCopySpaceStore } from "../store/copySpace";
import { agentBusy } from "../sidebarAgents";
import { formatBytes } from "../syncApi";
import type { ProjectInfo } from "../types";
import { CopySpaceRow } from "./CopySpaceRow";
import { HardDriveIcon } from "./icons";
import { projectDisplayName } from "./ProjectNameDisplay";
import { Modal } from "./ui/Modal";
import { useCopySpaces } from "./useCopySpaces";

/** A project's copies with what each takes of its own, and a way to free the
 *  dependencies and build caches of the ones nothing is using. */
export function CopySpaceDialog() {
  const original = useCopySpaceStore((s) => s.original);
  const close = useCopySpaceStore((s) => s.close);
  const projects = useAppStore((s) => s.projects);
  const copies = useMemo(
    () => (original ? projects.filter((p) => p.parentName === original) : []),
    [projects, original],
  );
  const { spaces, remeasure } = useCopySpaces(copies.map((p) => p.name));
  const [freeing, setFreeing] = useState(false);

  if (!original) return null;
  const parent = projects.find((p) => p.name === original);
  const title = parent ? projectDisplayName(parent) : original;
  const stateOf = (p: ProjectInfo) =>
    p.running || spaces.get(p.name)?.running ? "running" : agentBusy(p) ? "agent" : null;
  const idle = copies.filter((p) => stateOf(p) === null && freeableBytes(spaces.get(p.name)) > 0);
  const toFree = idle.reduce((n, p) => n + freeableBytes(spaces.get(p.name)), 0);
  const measuring = copies.some((p) => !spaces.has(p.name));
  const total = copies.reduce((n, p) => n + (spaces.get(p.name)?.bytes ?? 0), 0);
  const scale = Math.max(0, ...copies.map((p) => spaces.get(p.name)?.bytes ?? 0));
  const leftAlone = copies.some((p) => stateOf(p) !== null);

  const free = async () => {
    setFreeing(true);
    let freed = 0;
    const failed: string[] = [];
    for (const p of idle) {
      try {
        freed += Number(await FreeCopySpace(p.name)) || 0;
      } catch (err) {
        failed.push(`${projectDisplayName(p, parent)}: ${err}`);
      }
    }
    setFreeing(false);
    remeasure();
    if (freed > 0) {
      toast.success(`Freed ${formatBytes(freed)}`, {
        description: "Each copy installs its dependencies again on its next Start.",
      });
    }
    if (failed.length > 0) {
      toast.error("Couldn't free some space", { description: failed.join("\n") });
    }
  };

  return (
    <Modal
      open
      onClose={close}
      zIndexClassName="z-[60]"
      contentClassName="flex max-h-[80vh] w-[min(520px,92vw)] flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)] shadow-2xl"
    >
      <div className="flex shrink-0 items-start gap-3 px-6 pb-3 pt-6">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-cyan)]/10 text-[var(--accent-cyan)] ring-1 ring-inset ring-[var(--accent-cyan)]/20">
          <HardDriveIcon size={18} />
        </div>
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold leading-tight text-[var(--text-primary)]">
            Free space in {title} copies
            {!measuring && total > 0 && (
              <span className="font-normal text-[var(--text-muted)]"> · {formatBytes(total)}</span>
            )}
          </h3>
          <p className="mt-1 text-[12px] leading-snug text-[var(--text-muted)]">
            What each copy takes of its own. Dependencies and build caches come back by themselves: a
            copy installs its dependencies again on its next Start. Code, changes and .env files stay.
          </p>
        </div>
      </div>
      <ul className="min-h-0 flex-1 divide-y divide-[var(--border)] overflow-y-auto border-y border-[var(--border)]">
        {copies.map((p) => (
          <CopySpaceRow
            key={p.name}
            label={projectDisplayName(p, parent)}
            worktree={Boolean(p.worktree)}
            space={spaces.get(p.name)}
            state={stateOf(p)}
            scale={scale}
          />
        ))}
      </ul>
      <div className="flex shrink-0 items-center justify-end gap-2 px-6 pb-6 pt-4">
        {leftAlone && (
          <p className="mr-auto text-[11.5px] leading-snug text-[var(--text-muted)]">
            Copies that are running or have an agent at work are left alone.
          </p>
        )}
        <button
          type="button"
          onClick={close}
          className="rounded-lg px-4 py-2 text-[13px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)]"
        >
          Close
        </button>
        <button
          type="button"
          onClick={() => void free()}
          disabled={freeing || measuring || idle.length === 0}
          className="shrink-0 rounded-lg bg-[var(--text-primary)] px-4 py-2 text-[13px] font-medium text-[var(--bg-primary)] shadow-sm transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {freeing
            ? "Freeing…"
            : idle.length === 0
              ? "Nothing to free"
              : `Free ${formatBytes(toFree)} in ${idle.length} ${idle.length === 1 ? "copy" : "copies"}`}
        </button>
      </div>
    </Modal>
  );
}

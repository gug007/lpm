import { useEffect, useMemo, useState } from "react";
import { Archive, Search } from "lucide-react";
import { FreeProjectSpace } from "../../../bridge/commands";
import { MACHINE } from "../../machineWords";
import { toast } from "../../notifications/toast";
import { trashName } from "../../platform";
import {
  archiveSummary,
  matchesArchived,
  rebuildableBytes,
  sortArchived,
  type ArchivedProject,
  type ArchiveSort,
} from "../../projectArchive";
import { useProjectArchiveStore } from "../../store/projectArchive";
import { formatBytes } from "../../syncApi";
import { GlobalPageHeader } from "../GlobalPageHeader";
import { PORT_ACTION } from "../ports/portsStyles";
import { CAPS_LABEL } from "../settings/sectionStyles";
import { CARD_CLASS } from "../ui/fields";
import { ARCHIVE_GRID, ARCHIVE_PRIMARY } from "./archiveStyles";
import { ArchiveFreeDialog } from "./ArchiveFreeDialog";
import { ArchiveRemoveDialog, type ArchiveRemoval } from "./ArchiveRemoveDialog";
import { ArchiveRow } from "./ArchiveRow";
import { ArchiveSortHeader } from "./ArchiveSortHeader";
import { useProjectSizes } from "./useProjectSizes";

/** Every archived project, with what it keeps and the space it takes, and the
 *  ways to bring it back or get that space back. */
export function ArchiveView() {
  const byMachine = useProjectArchiveStore((s) => s.byMachine);
  const peers = useProjectArchiveStore((s) => s.peers);
  const load = useProjectArchiveStore((s) => s.load);
  const unarchive = useProjectArchiveStore((s) => s.unarchive);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<ArchiveSort>("archived");
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [removal, setRemoval] = useState<ArchiveRemoval | null>(null);
  const [freeing, setFreeing] = useState<ArchivedProject[] | null>(null);

  useEffect(() => {
    void load();
  }, [load]);

  const all = useMemo(() => Object.values(byMachine).flat(), [byMachine]);
  const { sizes, remeasure } = useProjectSizes(all);
  const shown = useMemo(
    () => sortArchived(all.filter((p) => matchesArchived(p, query)), sort, sizes),
    [all, query, sort, sizes],
  );
  const picked = all.filter((p) => selected.has(p.name));
  const onSeveralMachines = all.some((p) => p.machine !== "");
  const machineName = (p: ArchivedProject) =>
    !onSeveralMachines
      ? undefined
      : p.machine
        ? (peers.find((peer) => peer.slug === p.machine)?.alias ?? MACHINE.anotherMachine)
        : MACHINE.ThisMachineTitle;

  const measuredAll = all.length > 0 && all.every((p) => sizes.has(p.name));
  const total = all.reduce((n, p) => n + (sizes.get(p.name)?.bytes ?? 0), 0);
  const freeable = all.filter((p) => rebuildableBytes(sizes.get(p.name)) > 0);
  const rebuildable = freeable.reduce((n, p) => n + rebuildableBytes(sizes.get(p.name)), 0);
  const pickedBytes = picked.reduce((n, p) => n + (sizes.get(p.name)?.bytes ?? 0), 0);
  const allShownPicked = shown.length > 0 && shown.every((p) => selected.has(p.name));

  const toggle = (name: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (!next.delete(name)) next.add(name);
      return next;
    });
  const bringBack = (targets: ArchivedProject[]) => {
    setSelected((prev) => new Set([...prev].filter((n) => !targets.some((t) => t.name === n))));
    void unarchive(targets.map(({ name, label }) => ({ name, label })));
  };
  const free = async (targets: ArchivedProject[]) => {
    setFreeing(null);
    let freed = 0;
    const failed: string[] = [];
    for (const p of targets) {
      try {
        freed += Number(await FreeProjectSpace(p.name)) || 0;
      } catch (err) {
        failed.push(`${p.label}: ${err}`);
      }
    }
    remeasure();
    if (freed > 0) {
      toast.success(`Freed ${formatBytes(freed)}`, {
        description: `The folders are in the ${trashName()} until you empty it.`,
      });
    }
    if (failed.length > 0) {
      toast.error("Couldn't free some space", { description: failed.join("\n") });
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <GlobalPageHeader
        title="Archive"
        description={
          <>
            {archiveSummary(all)}
            {measuredAll && total > 0 && ` · ${formatBytes(total)} on disk`}
            {measuredAll && rebuildable > 0 && (
              <span className="text-[var(--accent-cyan)]"> · {formatBytes(rebuildable)} rebuildable</span>
            )}
          </>
        }
        actions={
          all.length > 0 && (
            <>
              <label className="flex h-8 w-52 items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--bg-secondary)] px-2 text-[12px] focus-within:border-[var(--text-muted)]">
                <Search size={13} className="shrink-0 text-[var(--text-muted)]" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search archived projects"
                  aria-label="Search archived projects"
                  className="min-w-0 flex-1 bg-transparent text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none"
                />
              </label>
              {measuredAll && rebuildable > 0 && (
                <button
                  type="button"
                  onClick={() => setFreeing(freeable)}
                  className={`${PORT_ACTION} h-8 px-3`}
                  title={`Move folders a reinstall recreates to the ${trashName()}`}
                >
                  Free {formatBytes(rebuildable)}…
                </button>
              )}
            </>
          )
        }
      />

      <div className="mt-5 min-h-0 flex-1 overflow-auto pb-1">
        {all.length === 0 ? (
          <div className={`flex flex-col items-center px-6 py-12 text-center ${CARD_CLASS}`}>
            <span className="mb-3 grid h-10 w-10 place-items-center rounded-full bg-[var(--bg-hover)] text-[var(--text-muted)]">
              <Archive size={18} aria-hidden />
            </span>
            <p className="text-[13px] font-medium text-[var(--text-primary)]">Nothing is archived</p>
            <p className="mt-1 max-w-md text-[12px] leading-relaxed text-[var(--text-muted)]">
              Right-click a project in the sidebar and pick Archive project to take it out of
              the list. Its setup, notes and folder stay, and it waits here.
            </p>
          </div>
        ) : (
          <div className={`min-w-[46rem] overflow-hidden ${CARD_CLASS}`}>
            {picked.length > 0 ? (
              <div className="sticky top-0 z-[1] flex h-10 items-center gap-3 border-b border-[var(--border)] bg-[var(--accent-cyan)]/10 px-4 text-[12px]">
                <input
                  type="checkbox"
                  checked={allShownPicked}
                  onChange={(e) =>
                    setSelected(e.target.checked ? new Set(shown.map((p) => p.name)) : new Set())
                  }
                  aria-label="Select every project shown"
                  className="h-3.5 w-3.5 accent-[var(--accent-cyan)]"
                />
                <span className="font-medium text-[var(--text-primary)]">{picked.length} selected</span>
                {pickedBytes > 0 && (
                  <span className="tabular-nums text-[var(--text-muted)]">{formatBytes(pickedBytes)}</span>
                )}
                <span className="flex-1" />
                <button type="button" onClick={() => setSelected(new Set())} className={PORT_ACTION}>
                  Clear
                </button>
                <button type="button" onClick={() => bringBack(picked)} className={ARCHIVE_PRIMARY}>
                  Unarchive {picked.length}
                </button>
              </div>
            ) : (
              <div
                className={`${ARCHIVE_GRID} sticky top-0 z-[1] h-10 border-b border-[var(--border)] bg-[var(--bg-secondary)] px-4 ${CAPS_LABEL}`}
              >
                <input
                  type="checkbox"
                  checked={false}
                  onChange={() => setSelected(new Set(shown.map((p) => p.name)))}
                  aria-label="Select every project shown"
                  className="h-3.5 w-3.5 accent-[var(--accent-cyan)]"
                />
                <ArchiveSortHeader id="name" label="Project" sort={sort} onSort={setSort} />
                <ArchiveSortHeader id="archived" label="Archived" sort={sort} onSort={setSort} />
                <ArchiveSortHeader id="size" label="Size" sort={sort} onSort={setSort} />
                <span>Automations</span>
                <span />
              </div>
            )}
            {shown.map((p) => (
              <ArchiveRow
                key={p.name}
                project={p}
                size={sizes.get(p.name)}
                machineName={machineName(p)}
                selected={selected.has(p.name)}
                onToggle={() => toggle(p.name)}
                onUnarchive={() => bringBack([p])}
                onFree={() => setFreeing([p])}
                onRemove={() => setRemoval({ project: p, from: "lpm" })}
                onTrash={() => setRemoval({ project: p, from: "disk" })}
              />
            ))}
            {shown.length === 0 && (
              <p className="px-4 py-8 text-center text-[12px] text-[var(--text-muted)]">
                No archived project matches “{query}”.
              </p>
            )}
          </div>
        )}
        {all.length > 0 && (
          <p className="mt-3 max-w-3xl px-1 text-[12px] leading-relaxed text-[var(--text-muted)]">
            Archived projects stay out of the sidebar, the project switcher and the phone, and
            their automations don't run. Unarchive puts one back where it was, set up as before.
          </p>
        )}
      </div>

      <ArchiveRemoveDialog removal={removal} onClose={() => setRemoval(null)} />
      <ArchiveFreeDialog
        projects={freeing}
        sizes={sizes}
        onCancel={() => setFreeing(null)}
        onConfirm={() => freeing && void free(freeing)}
      />
    </div>
  );
}

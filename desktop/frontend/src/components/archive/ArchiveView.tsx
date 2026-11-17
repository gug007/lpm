import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { MACHINE } from "../../machineWords";
import {
  archiveSummary,
  matchesArchived,
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
import { ARCHIVE_GRID } from "./archiveStyles";
import { ArchiveRemoveDialog } from "./ArchiveRemoveDialog";
import { ArchiveRow } from "./ArchiveRow";
import { useProjectSizes } from "./useProjectSizes";

const SORTS: { id: ArchiveSort; label: string }[] = [
  { id: "archived", label: "Recently archived" },
  { id: "name", label: "Name" },
  { id: "size", label: "Size" },
];

/** Every archived project, with what it keeps and the space it takes, and the
 *  way to bring it back. */
export function ArchiveView() {
  const byMachine = useProjectArchiveStore((s) => s.byMachine);
  const peers = useProjectArchiveStore((s) => s.peers);
  const load = useProjectArchiveStore((s) => s.load);
  const unarchive = useProjectArchiveStore((s) => s.unarchive);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<ArchiveSort>("archived");
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [removing, setRemoving] = useState<ArchivedProject | null>(null);

  useEffect(() => {
    void load();
  }, [load]);

  const all = useMemo(() => Object.values(byMachine).flat(), [byMachine]);
  const sizes = useProjectSizes(all);
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
  const total = all.reduce((n, p) => n + (sizes.get(p.name) ?? 0), 0);
  const summary =
    measuredAll && total > 0 ? `${archiveSummary(all)} · ${formatBytes(total)} on disk` : archiveSummary(all);

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

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <GlobalPageHeader
        title="Archive"
        description={summary}
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
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as ArchiveSort)}
                aria-label="Sort archived projects"
                className="h-8 rounded-md border border-[var(--border)] bg-[var(--bg-secondary)] px-2 text-[12px] text-[var(--text-secondary)] focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-blue)]"
              >
                {SORTS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </>
          )
        }
      />

      <div className="mt-5 min-h-0 flex-1 overflow-auto pb-1">
        {all.length === 0 ? (
          <div className={`px-6 py-10 text-center ${CARD_CLASS}`}>
            <p className="text-[13px] text-[var(--text-primary)]">Nothing is archived</p>
            <p className="mx-auto mt-1 max-w-md text-[12px] text-[var(--text-muted)]">
              Right-click a project in the sidebar and pick Archive project to take it out of
              the list. Its setup, notes and folder stay, and it waits here.
            </p>
          </div>
        ) : (
          <div className={`min-w-[46rem] overflow-hidden ${CARD_CLASS}`}>
            <div
              className={`${ARCHIVE_GRID} sticky top-0 z-[1] border-b border-[var(--border)] bg-[var(--bg-secondary)] px-4 py-2 ${CAPS_LABEL}`}
            >
              <input
                type="checkbox"
                checked={shown.length > 0 && shown.every((p) => selected.has(p.name))}
                onChange={(e) =>
                  setSelected(e.target.checked ? new Set(shown.map((p) => p.name)) : new Set())
                }
                aria-label="Select every project shown"
                className="h-3.5 w-3.5 accent-[var(--accent-cyan)]"
              />
              <span>Project</span>
              <span>Archived</span>
              <span>Size</span>
              <span>Automations</span>
              <span className="text-right">Actions</span>
            </div>
            {shown.map((p) => (
              <ArchiveRow
                key={p.name}
                project={p}
                size={sizes.get(p.name)}
                machineName={machineName(p)}
                selected={selected.has(p.name)}
                onToggle={() => toggle(p.name)}
                onUnarchive={() => bringBack([p])}
                onRemove={() => setRemoving(p)}
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
          <p className="mt-3 px-1 text-[12px] text-[var(--text-muted)]">
            Archived projects stay out of the sidebar, the project switcher and the phone, and
            their automations don't run. Unarchive puts one back where it was, set up as before.
          </p>
        )}
      </div>

      {picked.length > 0 && (
        <div className={`mt-3 flex items-center gap-3 px-4 py-2.5 text-[13px] ${CARD_CLASS}`}>
          <span className="text-[var(--text-secondary)]">{picked.length} selected</span>
          <span className="flex-1" />
          <button type="button" onClick={() => setSelected(new Set())} className={PORT_ACTION}>
            Clear
          </button>
          <button
            type="button"
            onClick={() => bringBack(picked)}
            className={`${PORT_ACTION} border-transparent bg-[var(--text-primary)] text-[var(--bg-primary)] hover:bg-[var(--text-primary)] hover:text-[var(--bg-primary)] hover:opacity-90`}
          >
            Unarchive {picked.length}
          </button>
        </div>
      )}

      <ArchiveRemoveDialog project={removing} onClose={() => setRemoving(null)} />
    </div>
  );
}

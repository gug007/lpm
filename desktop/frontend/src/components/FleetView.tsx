import { useCallback, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ClearStatus } from "../../bridge/commands";
import { useAppStore } from "../store/app";
import { useTerminalTitles } from "../store/terminalTitles";
import { peerAliasMap, usePeerState } from "../peer/usePeerState";
import { useAllJobs, type ScheduledJob } from "../hooks/useJobs";
import { useKeyboardShortcut } from "../hooks/useKeyboardShortcut";
import { usePrefersReducedMotion } from "../hooks/usePrefersReducedMotion";
import { useFleetServicePorts } from "../hooks/useFleetServicePorts";
import { useFleetOrder } from "../useFleetOrder";
import { buildFleet, type FleetChip, type FleetRow } from "../fleetRows";
import { applyFleetFilter, type FleetKindFilter } from "../fleetFilter";
import type { FleetProjectIdentity } from "../fleetIdentity";
import { EmptyState } from "./ui/EmptyState";
import { FleetGroupHeader } from "./FleetGroupHeader";
import { FleetHeader, KIND_OPTIONS } from "./FleetHeader";
import { FleetRowItem, fleetRowDomId } from "./FleetRowItem";
import { FleetServices } from "./FleetServices";

const NO_JOBS: ScheduledJob[] = [];

export interface FleetViewProps {
  /** Escape leaves Fleet. Omitted, Escape only drops the selection. */
  onExit?: () => void;
  /** Where a row belonging to no one project goes: sending it to one of a job's
   *  projects would land the user somewhere the job may not be running. */
  onOpenAutomations?: () => void;
}

export function FleetView({ onExit, onOpenAutomations }: FleetViewProps) {
  const projects = useAppStore((s) => s.projects);
  const selectProject = useAppStore((s) => s.selectProject);
  const focusProjectTerminal = useAppStore((s) => s.focusProjectTerminal);
  const toggleService = useAppStore((s) => s.toggleService);
  const startProject = useAppStore((s) => s.startProject);
  const stopProject = useAppStore((s) => s.stopProject);
  const terminalTitles = useTerminalTitles((s) => s.byProject);
  const { state: peerState } = usePeerState();
  const reducedMotion = usePrefersReducedMotion();
  const { jobs } = useAllJobs();

  const [kind, setKind] = useState<FleetKindFilter>("all");
  const [query, setQuery] = useState("");
  const [grouped, setGrouped] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const peerAliases = useMemo(
    () => peerAliasMap(peerState.peers),
    [peerState.peers],
  );

  // Built without the clock so typing, moving and ticking never rebuild it.
  const fleet = useMemo(
    () =>
      buildFleet({
        projects,
        jobs: jobs ?? NO_JOBS,
        now: Date.now(),
        filter: {},
        peerAliases,
        terminalTitles,
      }),
    [projects, jobs, peerAliases, terminalTitles],
  );

  const visible = useMemo(
    () => applyFleetFilter(fleet.rows, fleet.services, { query, kind }),
    [fleet, query, kind],
  );

  const servicePorts = useFleetServicePorts(fleet.services);

  const { rows, stale, hold, release, holdForKey, resettle } = useFleetOrder(
    visible.rows,
  );

  const openAutomations = useCallback(() => {
    if (onOpenAutomations) onOpenAutomations();
    else toast.info("This automation isn't tied to one project.");
  }, [onOpenAutomations]);

  const openRow = useCallback(
    (row: FleetRow) => {
      if (!row.project.name) openAutomations();
      else if (row.terminalId)
        focusProjectTerminal(row.project.name, row.terminalId);
      else selectProject(row.project.name);
    },
    [focusProjectTerminal, selectProject, openAutomations],
  );

  // A lit profile means the project is running that profile and nothing else,
  // so stopping it is stopping the project.
  const runChip = useCallback(
    (project: string, chip: FleetChip) => {
      if (chip.kind === "service") void toggleService(project, chip.name);
      else if (chip.running) void stopProject(project);
      else void startProject(project, chip.name);
    },
    [toggleService, startProject, stopProject],
  );

  const dismissRow = useCallback((row: FleetRow) => {
    if (row.dismissBlocked) {
      toast.info(row.dismissBlocked);
      return;
    }
    if (!row.terminalId || !row.statusValue) return;
    ClearStatus(row.project.name, row.terminalId, row.statusValue).catch((err) =>
      toast.error(`Could not clear this row: ${String(err)}`),
    );
  }, []);

  const move = useCallback(
    (delta: number) => {
      if (rows.length === 0) return;
      holdForKey();
      const at = selectedId ? rows.findIndex((row) => row.id === selectedId) : -1;
      const next =
        at < 0
          ? delta > 0
            ? 0
            : rows.length - 1
          : Math.min(rows.length - 1, Math.max(0, at + delta));
      setSelectedId(rows[next].id);
    },
    [rows, selectedId, holdForKey],
  );

  const selectedRow = selectedId
    ? rows.find((row) => row.id === selectedId)
    : undefined;

  // `meta: false` on every one of these: the plain-key shortcuts must stand
  // down for the app's own Cmd chords (Cmd+1-9 switches project).
  const chord = (k: string) => ({ key: k, meta: false, whileTyping: false });
  useKeyboardShortcut([chord("j"), chord("ArrowDown")], () => move(1));
  useKeyboardShortcut([chord("k"), chord("ArrowUp")], () => move(-1));
  useKeyboardShortcut(chord("Enter"), () => selectedRow && openRow(selectedRow));
  useKeyboardShortcut(chord(" "), () => selectedRow && dismissRow(selectedRow));
  useKeyboardShortcut(chord("/"), () => searchRef.current?.focus());
  useKeyboardShortcut(chord("g"), () => setGrouped((on) => !on));
  useKeyboardShortcut(
    KIND_OPTIONS.map((_option, i) => chord(String(i + 1))),
    (_event, matched) => setKind(KIND_OPTIONS[Number(matched.key) - 1].value),
  );
  useKeyboardShortcut(chord("Escape"), () => {
    setSelectedId(null);
    onExit?.();
  });

  const sections = useMemo(() => {
    if (!grouped) return null;
    const byProject = new Map<
      string,
      { project: FleetProjectIdentity; rows: FleetRow[] }
    >();
    for (const row of rows) {
      // Rows naming no project have no name to group on, and the sets they
      // stand for differ — keep "No project" and "Multiple projects" apart.
      const key = row.project.name || row.project.label;
      const group = byProject.get(key);
      if (group) group.rows.push(row);
      else byProject.set(key, { project: row.project, rows: [row] });
    }
    return [...byProject.entries()];
  }, [rows, grouped]);

  const renderRow = (row: FleetRow, hideProject: boolean) => (
    <FleetRowItem
      key={row.id}
      row={row}
      selected={row.id === selectedId}
      reducedMotion={reducedMotion}
      hideProject={hideProject}
      onOpen={openRow}
      onDismiss={dismissRow}
    />
  );

  const filtered = query.trim() !== "" || kind !== "all";
  const nothing = rows.length === 0 && visible.services.length === 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <FleetHeader
        counts={fleet.counts}
        kind={kind}
        onKindChange={setKind}
        query={query}
        onQueryChange={setQuery}
        searchRef={searchRef}
        grouped={grouped}
        onGroupedChange={setGrouped}
      />

      <div className="no-scrollbar mt-4 min-h-0 flex-1 overflow-y-auto pb-2">
        {jobs === null && nothing ? (
          <p className="py-8 text-center text-[12px] text-[var(--text-muted)]">
            Loading…
          </p>
        ) : nothing ? (
          <EmptyState
            title={filtered ? "Nothing matches" : "Nothing is running"}
            body={
              filtered
                ? "Try a different search, or switch back to All."
                : "Start an agent in a project and it shows up here, along with anything a scheduled job is running."
            }
          />
        ) : (
          <div className="space-y-6">
            {stale && (
              <button
                type="button"
                onClick={resettle}
                className="flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-[var(--border)] px-2 py-1 text-[11px] text-[var(--text-muted)] transition-colors hover:border-[var(--text-muted)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-blue)]"
              >
                Newer rows are waiting to move up — sort now
              </button>
            )}
            <div
              role="listbox"
              aria-label="Agents and automations"
              aria-activedescendant={
                selectedRow ? fleetRowDomId(selectedRow.id) : undefined
              }
              onMouseEnter={hold}
              onMouseLeave={release}
              className={sections ? "space-y-5" : "space-y-0.5"}
            >
              {sections
                ? sections.map(([key, group]) => (
                    <section key={`group/${key}`}>
                      <FleetGroupHeader
                        project={group.project}
                        onOpen={() =>
                          group.project.name
                            ? selectProject(group.project.name)
                            : openAutomations()
                        }
                      />
                      <div className="mt-1 space-y-0.5">
                        {group.rows.map((row) => renderRow(row, true))}
                      </div>
                    </section>
                  ))
                : rows.map((row) => renderRow(row, false))}
            </div>

            <FleetServices
              groups={visible.services}
              detected={servicePorts}
              onRunChip={runChip}
              onStop={(project) => void stopProject(project)}
              onOpenProject={selectProject}
            />
          </div>
        )}

        <div className="mt-6 flex flex-wrap items-center justify-between gap-2 text-[10px] text-[var(--text-muted)]">
          <span>
            Agents show up for projects you have opened in this session, and go
            when the app closes. Gemini and OpenCode don't report back, and
            neither does anything you start in Terminals, so none of those
            appear here.
            {fleet.peerAutomationsHidden &&
              ` Automations on ${fleet.peerAutomationMacs.join(", ")} aren't listed here.`}
          </span>
          <span className="tabular-nums">
            {fleet.quietProjectCount}{" "}
            {fleet.quietProjectCount === 1 ? "project" : "projects"} with nothing
            running
          </span>
        </div>
      </div>
    </div>
  );
}

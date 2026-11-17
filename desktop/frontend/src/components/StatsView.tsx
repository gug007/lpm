import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LoaderCircle, RefreshCw } from "lucide-react";
import { AgentUsageMachines } from "../../bridge/commands";
import type { AgentUsageStats, MachinesUsage, UsageMachine } from "../types";
import { StatTiles } from "./stats/StatTiles";
import { TokenActivityChart } from "./stats/TokenActivityChart";
import { BreakdownPanel } from "./stats/BreakdownPanel";
import { ProjectsPanel } from "./stats/ProjectsPanel";
import { RecentSessionsPanel } from "./stats/RecentSessionsPanel";
import { StatsSkeleton } from "./stats/StatsSkeleton";
import { ComputerMenu } from "./stats/ComputerMenu";
import { StatsScopeChip } from "./stats/StatsScopeChip";
import { useStatsScope } from "./stats/useStatsScope";
import { StatsWeeklyRecap } from "./recap/StatsWeeklyRecap";
import { StatsPeriodPicker } from "./stats/StatsPeriodPicker";
import { StatsScroll } from "./stats/StatsScroll";
import { StatsEmpty } from "./stats/StatsEmpty";
import { GlobalPageHeader } from "./GlobalPageHeader";
import { distinctModelCount } from "./stats/statsDerive";
import {
  ALL_MACHINES,
  LOCAL_MACHINE,
  isCounted,
  machineNames,
  machinesNoun,
  statsSubtitle,
} from "./stats/statsMachines";
import { MACHINE } from "../machineWords";
import { useAppStore } from "../store/app";
import { displayNameForProjectName } from "./ProjectNameDisplay";

export function StatsView() {
  const [days, setDays] = useState(30);
  const [machine, setMachine] = useState(ALL_MACHINES);
  const [stats, setStats] = useState<AgentUsageStats | null>(null);
  const [machines, setMachines] = useState<UsageMachine[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  // A switch of period or computer retires the read still in flight, so a slow
  // answer for the old pick never lands over the new one.
  const latest = useRef(0);

  const load = useCallback(
    async (fresh = false) => {
      const mine = ++latest.current;
      setLoading(true);
      setError("");
      try {
        const usage = (await AgentUsageMachines(days, machine, fresh)) as MachinesUsage;
        if (mine !== latest.current) return;
        setStats(usage.stats);
        setMachines(usage.machines);
      } catch (cause) {
        if (mine === latest.current) setError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        if (mine === latest.current) setLoading(false);
      }
    },
    [days, machine],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const allProjects = useAppStore((s) => s.projects);
  const view = useStatsScope(stats, days);
  const { scope, scoped } = view;
  // A new period or computer starts from a blank page and an unfocused view.
  const startOver = () => {
    setStats(null);
    view.reset();
  };
  const totalFiles = stats?.sources.reduce((sum, source) => sum + source.files, 0) ?? 0;
  const names = useMemo(() => machineNames(machines), [machines]);
  const several = machines.length > 1 && machine !== LOCAL_MACHINE;
  const noun = machinesNoun(machines);
  const filesWhere =
    machine === ALL_MACHINES
      ? `on ${machines.filter(isCounted).length} ${noun.many}`
      : names[machine]
        ? `on ${names[machine]}`
        : "";

  return (
    <div
      className="flex min-h-0 flex-1 flex-col"
      onKeyDown={(event) => {
        if (event.key === "Escape" && view.stepBack()) event.stopPropagation();
      }}
    >
      <GlobalPageHeader
        title="Stats"
        badge={
          (scope.project || view.rangeText) && (
            <span className="flex min-w-0 items-center gap-1.5">
              {scope.project && (
                <StatsScopeChip
                  label={displayNameForProjectName(scope.project, allProjects)}
                  clearLabel="Show every project"
                  onClear={() => view.focusProject(null)}
                />
              )}
              {view.rangeText && (
                <StatsScopeChip
                  label={view.rangeText}
                  clearLabel="Show the whole period"
                  onClear={view.clearRange}
                />
              )}
            </span>
          )
        }
        description={statsSubtitle(machine, machines)}
        actions={
          <>
            {machines.length > 1 && (
              <ComputerMenu
                machines={machines}
                selected={machine}
                onSelect={(id) => {
                  startOver();
                  setMachine(id);
                }}
              />
            )}
            <StatsPeriodPicker
              days={days}
              onChange={(next) => {
                startOver();
                setDays(next);
              }}
            />
            <button
              onClick={() => void load(true)}
              disabled={loading}
              aria-label="Refresh stats"
              title="Refresh"
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--text-muted)] transition-colors duration-[120ms] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-blue)] disabled:opacity-50"
            >
              {loading ? <LoaderCircle size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            </button>
          </>
        }
      />

      <StatsScroll>
        <StatsWeeklyRecap />
        {error && (
          <div className="flex items-center justify-between gap-4 rounded-xl border border-[var(--accent-red)]/30 bg-[var(--accent-red)]/8 px-4 py-3 text-sm text-[var(--accent-red-text)]">
            <span>Could not load agent stats: {error}</span>
            <button
              onClick={() => void load()}
              className="shrink-0 rounded font-medium underline underline-offset-2 hover:no-underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-blue)]"
            >
              Try again
            </button>
          </div>
        )}

        {!error && !stats && loading && <StatsSkeleton days={days} />}

        {stats && scoped && (
          <div
            className="space-y-4 transition-opacity duration-200"
            style={{ opacity: loading ? 0.6 : 1 }}
          >
            <StatTiles
              totals={scoped.totals}
              sessions={scoped.sessions}
              daily={view.tileDays}
              models={scoped.models}
              projectCount={scoped.projects.length}
              modelCount={
                scoped === stats
                  ? distinctModelCount(stats.recentSessions)
                  : new Set(scoped.models.map((model) => model.key)).size
              }
              days={view.tileDayCount}
              singleDayCaption={view.singleDayCaption}
              previous={scope.project || scope.range ? undefined : stats.previous}
              changeLabel={view.changeLabel}
            />

            {stats.totals.totalTokens === 0 ? (
              <StatsEmpty />
            ) : (
              <>
                <div className="grid grid-cols-[minmax(0,1.55fr)_minmax(280px,0.9fr)] gap-4">
                  <TokenActivityChart
                    daily={view.chartDaily}
                    pinned={scope.range}
                    onPin={view.pin}
                  />
                  <BreakdownPanel providers={scoped.providers} totals={scoped.totals} />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <ProjectsPanel
                    days={view.rangeDays}
                    periodDays={view.periodDays}
                    fallback={stats.projects}
                    previous={scope.range ? undefined : stats.previous}
                    changeLabel={view.changeLabel}
                    emptyLabel={view.emptyLabel}
                    focused={scope.project}
                    onFocus={view.focusProject}
                  />
                  <RecentSessionsPanel
                    sessions={scoped.recentSessions}
                    total={scoped.sessions}
                    emptyLabel={view.emptyLabel}
                    machineNames={names}
                  />
                </div>
              </>
            )}

            <div className="flex items-center justify-between gap-4 pb-1 text-[12px] text-[var(--text-secondary)]">
              <span>
                {several
                  ? `Each ${noun.one} reads its own history and shares only usage numbers.`
                  : `Usage metadata stays on ${MACHINE.thisMachine}.`}{" "}
                Prompts and responses are not included.
              </span>
              <span>
                {totalFiles.toLocaleString()} {several ? "" : "local "}history files scanned
                {several && filesWhere ? ` ${filesWhere}` : ""} · SSH projects excluded
              </span>
            </div>
          </div>
        )}
      </StatsScroll>
    </div>
  );
}

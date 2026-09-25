"use client";

import { useMemo, useState } from "react";
import StatsActivityChart from "./stats-activity-chart";
import type { ChartMode } from "./stats-chart-scale";
import StatsComposition from "./stats-composition";
import { DEFAULT_SORT, nextSort, periodStats, type ProjectSortKey } from "./stats-derive";
import StatsDonut from "./stats-donut";
import { formatCount } from "./stats-format";
import StatsProjects from "./stats-projects";
import { FILES_SCANNED, PERIODS, type Period, type Provider } from "./stats-sample-data";
import StatsSegmented from "./stats-segmented";
import StatsSessions from "./stats-sessions";
import StatsTiles from "./stats-tiles";
import { INLINE_CODE } from "./page-styles";
import { trackOnce } from "./track-once";
import { useClientNow } from "./use-client-now";

const CARD = "rounded-xl border border-[var(--border)] bg-[var(--bg-primary)]";
const RECENT_SESSION_CAP = 50;

export default function StatsExplorer() {
  const now = useClientNow();
  const [period, setPeriod] = useState<Period>(30);
  const [hidden, setHidden] = useState<ReadonlySet<Provider>>(() => new Set());
  const [mode, setMode] = useState<ChartMode>("volume");
  const [sort, setSort] = useState(DEFAULT_SORT);
  const [showAllProjects, setShowAllProjects] = useState(false);
  const [openSession, setOpenSession] = useState<number | null>(null);
  const [activeProvider, setActiveProvider] = useState<Provider | null>(null);
  const stats = useMemo(() => periodStats(period), [period]);

  const changePeriod = (next: Period) => {
    if (next === period) return;
    trackOnce("stats-period");
    setPeriod(next);
    setOpenSession(null);
  };

  const toggleProvider = (provider: Provider) => {
    trackOnce("stats-provider");
    setHidden((current) => {
      const next = new Set(current);
      if (next.has(provider)) next.delete(provider);
      else next.add(provider);
      return next;
    });
  };

  const changeMode = (next: ChartMode) => {
    if (next === mode) return;
    trackOnce("stats-mode");
    setMode(next);
  };

  const changeSort = (key: ProjectSortKey) => {
    trackOnce("stats-sort");
    setSort((current) => nextSort(current, key));
  };

  const openSessionAt = (index: number | null) => {
    if (index !== null) trackOnce("stats-session");
    setOpenSession(index);
  };

  return (
    <div>
      <div
        data-on-dark
        className="replica-ui mx-auto max-w-6xl rounded-2xl bg-[#0d0d0d] p-3 text-[var(--text-primary)] ring-1 ring-black/10 sm:p-5 dark:ring-white/10"
      >
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
          <div className="min-w-0">
            <p className="text-[15px] font-semibold tracking-tight">Stats</p>
            <p className="mt-0.5 text-xs text-[var(--text-muted)]">
              Local token usage across your LPM projects
            </p>
          </div>
          <StatsSegmented label="Period" options={PERIODS} value={period} onChange={changePeriod} />
        </div>

        <div className="mt-4 space-y-2 sm:space-y-3">
          <StatsTiles stats={stats} singleDay={period === 1} now={now} />

          <div className="grid gap-2 sm:gap-3 lg:grid-cols-3">
            <StatsActivityChart
              key={period}
              days={stats.chartDays}
              period={period}
              hidden={hidden}
              mode={mode}
              now={now}
              onToggleProvider={toggleProvider}
              onMode={changeMode}
            />
            <div className={`flex min-w-0 flex-col p-3 sm:p-4 ${CARD}`}>
              <StatsDonut
                claude={stats.tokens.claude}
                codex={stats.tokens.codex}
                sessions={stats.sessions}
                active={activeProvider}
                onActive={setActiveProvider}
              />
              <div className="my-4 border-t border-[var(--border)]" />
              <StatsComposition parts={stats.composition} />
            </div>
          </div>

          <div className="grid gap-2 sm:gap-3 lg:grid-cols-2">
            <StatsProjects
              projects={stats.projects}
              sort={sort}
              onSort={changeSort}
              showAll={showAllProjects}
              onShowAll={setShowAllProjects}
            />
            <StatsSessions
              sessions={stats.recentSessions}
              available={Math.min(RECENT_SESSION_CAP, stats.sessionCount)}
              openSession={openSession}
              onOpenSession={openSessionAt}
              now={now}
            />
          </div>

          <div className="flex flex-col gap-1 pt-1 text-[11px] text-[var(--text-muted)] lg:flex-row lg:items-center lg:justify-between lg:gap-4">
            <p>Usage metadata stays on this Mac. Prompts and responses are not included.</p>
            <p>{`${formatCount(FILES_SCANNED)} local history files scanned · SSH projects excluded`}</p>
          </div>
        </div>
      </div>

      {period === 0 && (
        <p className="mx-auto mt-4 max-w-2xl text-pretty text-center text-sm leading-relaxed text-gray-600 dark:text-gray-300">
          All time reaches as far back as the session files on disk. Claude Code deletes its
          transcripts after 30 days unless you raise <code className={INLINE_CODE}>cleanupPeriodDays</code>,
          which is why this sample&apos;s Claude history stops a month back.
        </p>
      )}
    </div>
  );
}

import { useMemo, useState } from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "../../../icons";
import { useNow } from "../../../../hooks/useNow";
import {
  accentVar,
  colorProject,
  legendProjects,
} from "../../../../scheduleColors";
import {
  addDays,
  agendaAhead,
  buildBoard,
  recentRuns,
  runningJobs,
  startOfWeek,
  weekRangeLabel,
} from "../../../../scheduleBoard";
import type { ScheduledJob } from "../../../../hooks/useJobs";
import { ScheduleGrid } from "./ScheduleGrid";
import { ScheduleLegend } from "./ScheduleLegend";
import { ScheduleUnscheduled } from "./ScheduleUnscheduled";
import { ScheduleAgenda } from "./ScheduleAgenda";
import { ScheduleRecent } from "./ScheduleRecent";

const HORIZON_HOURS = 24;

interface ScheduleWeekViewProps {
  jobs: ScheduledJob[];
  scopeLabelFor: (job: ScheduledJob) => string;
  keyOf: (job: ScheduledJob) => string;
  projectLabel: (name: string) => string;
  onOpen: (job: ScheduledJob) => void;
  onRunNow: (job: ScheduledJob) => void;
  onStop: (job: ScheduledJob) => void;
}


// Every job across every project, laid out over one week: when each fires, what
// is running, what lands next, and what just finished.
export function ScheduleWeekView({
  jobs,
  scopeLabelFor,
  keyOf,
  projectLabel,
  onOpen,
  onRunNow,
  onStop,
}: ScheduleWeekViewProps) {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const nowMs = useNow(true);
  const now = Math.floor(nowMs / 1000);

  const board = useMemo(
    () => buildBoard({ jobs, weekStart, now, keyOf }),
    [jobs, weekStart, now, keyOf],
  );
  const running = useMemo(() => runningJobs(jobs), [jobs]);
  const ahead = useMemo(
    () => agendaAhead(jobs, now, HORIZON_HOURS, keyOf),
    [jobs, now, keyOf],
  );
  const recent = useMemo(() => recentRuns(jobs, keyOf), [jobs, keyOf]);

  const legend = useMemo(() => {
    const names = legendProjects(jobs.map(colorProject));
    return names.map((name) => ({ name, label: projectLabel(name) }));
  }, [jobs, projectLabel]);
  const accentByLabel = useMemo(
    () => new Map(legend.map((p) => [p.label, accentVar(p.name)])),
    [legend],
  );

  const thisWeek = startOfWeek(new Date(nowMs));
  const onThisWeek = weekStart.getTime() === thisWeek.getTime();
  const step = (weeks: number) => setWeekStart((w) => addDays(w, weeks * 7));

  const navButton =
    "grid h-7 w-7 place-items-center rounded-md text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]";

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <button type="button" onClick={() => step(-1)} className={navButton} aria-label="Previous week">
          <ChevronLeftIcon />
        </button>
        <button type="button" onClick={() => step(1)} className={navButton} aria-label="Next week">
          <ChevronRightIcon />
        </button>
        <h2 className="ml-1 flex items-baseline gap-2 text-[13px] font-semibold text-[var(--text-primary)]">
          {onThisWeek ? "This week" : "Week of"}
          <span className="text-[12px] font-medium tabular-nums text-[var(--text-muted)]">
            {weekRangeLabel(weekStart, new Date(nowMs))}
          </span>
        </h2>
        <div className="flex-1" />
        {!onThisWeek && (
          <button
            type="button"
            onClick={() => setWeekStart(thisWeek)}
            className="rounded-md px-2.5 py-1 text-[12px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
          >
            Today
          </button>
        )}
      </div>

      <ScheduleGrid
        board={board}
        now={now}
        scopeLabelFor={scopeLabelFor}
        onOpen={onOpen}
      />

      <ScheduleLegend
        projects={legend.map((p) => p.label)}
        accentFor={(label) => accentByLabel.get(label) ?? accentVar(undefined)}
      />

      <ScheduleUnscheduled
        jobs={board.unscheduled}
        dense={board.dense}
        scopeLabelFor={scopeLabelFor}
        onOpen={onOpen}
        onRunNow={onRunNow}
      />

      <div className="@container grid min-w-0 gap-3 @min-[880px]:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <ScheduleAgenda
          running={running}
          ahead={ahead}
          horizonHours={HORIZON_HOURS}
          now={now}
          scopeLabelFor={scopeLabelFor}
          onOpen={onOpen}
          onStop={onStop}
        />
        <ScheduleRecent runs={recent} now={now} onOpen={onOpen} />
      </div>
    </div>
  );
}

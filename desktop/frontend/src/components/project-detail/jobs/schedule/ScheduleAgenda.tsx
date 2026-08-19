import { Fragment } from "react";
import { StopIcon } from "../../../icons";
import { formatRunningFor, formatSchedule, type JobInfo } from "../../../../jobsFormat";
import type { JobOccurrence } from "../../../../jobsOccurrences";
import { formatClock, jobName, untilLabel } from "../../../../scheduleBoard";

type BoardJob = JobInfo & { project?: string };

interface ScheduleAgendaProps {
  running: BoardJob[];
  ahead: JobOccurrence[];
  horizonHours: number;
  now: number;
  scopeLabelFor: (job: BoardJob) => string;
  onOpen: (job: BoardJob) => void;
  onStop: (job: BoardJob) => void;
}

// The panels around the board share one chrome so they read as a set: the same
// heading, the same hairline between rows, the same row height.
const PANEL =
  "min-w-0 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg-primary)]";
const HEADING =
  "flex items-baseline gap-2 border-b border-[var(--border)] px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-secondary)]";
const HEADING_COUNT =
  "text-[11px] font-normal normal-case tracking-normal tabular-nums text-[var(--text-muted)]";
const ROW =
  "flex min-h-[38px] w-full items-center gap-2.5 border-b border-[var(--border)] px-3 py-2 text-left transition-colors last:border-b-0 hover:bg-[var(--bg-hover)]";
const QUIET =
  "border-b border-[var(--border)] px-3 py-3 text-[12px] text-[var(--text-muted)] last:border-b-0";
const GROUP =
  "flex items-center gap-2 border-b border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]";
const WHEN = "w-[62px] shrink-0 text-right";
const WHEN_TIME =
  "block text-[13px] font-semibold tabular-nums leading-tight text-[var(--text-primary)]";
const WHEN_SUB = "block text-[11px] leading-tight tabular-nums text-[var(--text-muted)]";
const NAME = "min-w-0 shrink truncate text-[13px] font-medium text-[var(--text-primary)]";
const SCOPE = "shrink-0 truncate text-[11px] text-[var(--text-muted)]";
const META = "mt-0.5 block truncate text-[11px] tabular-nums text-[var(--text-muted)]";

const DAY_STAMP = new Intl.DateTimeFormat(undefined, { weekday: "short", day: "numeric" });

function dayStart(atSecs: number): number {
  const d = new Date(atSecs * 1000);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function dayLabel(atSecs: number, now: number): string {
  const days = Math.round((dayStart(atSecs) - dayStart(now)) / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  return DAY_STAMP.format(new Date(atSecs * 1000));
}

export function ScheduleAgenda({
  running,
  ahead,
  horizonHours,
  now,
  scopeLabelFor,
  onOpen,
  onStop,
}: ScheduleAgendaProps) {
  const groups: { key: number; label: string; items: JobOccurrence[] }[] = [];
  for (const occ of ahead) {
    const key = dayStart(occ.at);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.items.push(occ);
    else groups.push({ key, label: dayLabel(occ.at, now), items: [occ] });
  }
  // A horizon that stays inside one day needs no day headers — they'd all say
  // "Today".
  const showDays = groups.length > 1;

  return (
    <section className={PANEL}>
      <h3 className={HEADING}>
        Now
        {running.length > 0 && (
          <span className={HEADING_COUNT}>
            {running.length} {running.length === 1 ? "run" : "runs"}
          </span>
        )}
      </h3>

      {running.length === 0 ? (
        <p className={QUIET}>Nothing running right now.</p>
      ) : (
        running.map((job) => (
          <div key={`run/${job.id}/${job.runningSince ?? 0}`} className={ROW}>
            <button
              type="button"
              onClick={() => onOpen(job)}
              title={`${jobName(job)} — open`}
              className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
            >
              <span className={WHEN}>
                <span className={WHEN_TIME}>
                  {job.runningSince !== undefined ? formatClock(job.runningSince) : "—"}
                </span>
                <span className={WHEN_SUB}>started</span>
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex min-w-0 items-baseline gap-1.5">
                  {job.emoji && <span className="shrink-0 text-[12px]">{job.emoji}</span>}
                  <span className={NAME}>{jobName(job)}</span>
                  <span className={SCOPE}>{scopeLabelFor(job)}</span>
                </span>
                <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-[var(--accent-cyan-text)]">
                  <span
                    aria-hidden
                    className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent-cyan)] motion-safe:animate-pulse"
                  />
                  <span className="truncate tabular-nums">
                    {formatRunningFor(job.runningSince, now * 1000)}
                  </span>
                </span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => onStop(job)}
              title="Stop"
              aria-label={`Stop ${jobName(job)}`}
              className="shrink-0 rounded-md p-1.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--accent-red-text)]"
            >
              <StopIcon />
            </button>
          </div>
        ))
      )}

      <h3 className={`${HEADING} border-t border-[var(--border)]`}>
        Next {horizonHours} hours
        {ahead.length > 0 && (
          <span className={HEADING_COUNT}>
            {ahead.length} {ahead.length === 1 ? "run" : "runs"}
          </span>
        )}
      </h3>

      {ahead.length === 0 ? (
        <p className={QUIET}>Nothing due in the next {horizonHours} hours.</p>
      ) : (
        groups.map((group) => (
          <Fragment key={group.key}>
            {showDays && <div className={GROUP}>{group.label}</div>}
            {group.items.map((occ) => {
              const job = occ.job;
              const meta = [
                occ.untilAt !== undefined ? `until ${formatClock(occ.untilAt)}` : "",
                occ.count > 1 ? `× ${occ.count}` : "",
                job.schedule ? formatSchedule(job.schedule) : "",
              ]
                .filter(Boolean)
                .join(" · ");
              return (
                <button
                  key={occ.key}
                  type="button"
                  onClick={() => onOpen(job)}
                  title={
                    occ.approximate
                      ? `${jobName(job)} — expected around ${formatClock(occ.at)}; this schedule leaves the exact time to chance`
                      : `${jobName(job)} — ${formatClock(occ.at)}`
                  }
                  className={ROW}
                >
                  <span className={WHEN}>
                    <span className={WHEN_TIME}>
                      {occ.approximate && (
                        <span className="text-[var(--text-muted)]">~</span>
                      )}
                      {formatClock(occ.at)}
                    </span>
                    <span className={WHEN_SUB}>{untilLabel(occ.at, now)}</span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex min-w-0 items-baseline gap-1.5">
                      {job.emoji && <span className="shrink-0 text-[12px]">{job.emoji}</span>}
                      <span className={NAME}>{jobName(job)}</span>
                      <span className={SCOPE}>{scopeLabelFor(job)}</span>
                    </span>
                    {meta && <span className={META}>{meta}</span>}
                  </span>
                </button>
              );
            })}
          </Fragment>
        ))
      )}
    </section>
  );
}

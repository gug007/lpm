import {
  jobResultLabel,
  jobResultTone,
  TONE_DOT_CLASS,
  type JobInfo,
} from "../../../../jobsFormat";
import { relativeTime } from "../../../../relativeTime";
import { formatClock, jobName, type RecentRun } from "../../../../scheduleBoard";

type BoardJob = JobInfo & { project?: string };

interface ScheduleRecentProps {
  runs: RecentRun[];
  now: number;
  onOpen: (job: BoardJob) => void;
}

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

const WEEKDAY = new Intl.DateTimeFormat(undefined, { weekday: "short" });

function dayStart(atSecs: number): number {
  const d = new Date(atSecs * 1000);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

// "09:36" for today, "Tue 09:36" for anything older — the weekday only earns
// its space once the time alone stops being enough.
function stamp(atSecs: number, now: number): string {
  const clock = formatClock(atSecs);
  if (dayStart(atSecs) === dayStart(now)) return clock;
  return `${WEEKDAY.format(new Date(atSecs * 1000))} ${clock}`;
}

function ageLabel(atSecs: number): string {
  const age = relativeTime(atSecs);
  return age === "now" ? "just now" : `${age} ago`;
}

export function ScheduleRecent({ runs, now, onOpen }: ScheduleRecentProps) {
  return (
    <aside className={PANEL}>
      <h3 className={HEADING}>
        Recently finished
        {runs.length > 0 && <span className={HEADING_COUNT}>{runs.length}</span>}
      </h3>

      {runs.length === 0 ? (
        <p className={QUIET}>No runs recorded yet.</p>
      ) : (
        runs.map((run) => {
          const job = run.job;
          const unread = run.unread;
          const outcome = jobResultLabel(run.result) || "Finished";
          return (
            <button
              key={run.key}
              type="button"
              onClick={() => onOpen(job)}
              title={`${jobName(job)} — ${outcome}, ${ageLabel(run.at)}`}
              className={`${ROW} ${
                unread > 0
                  ? "bg-[color-mix(in_srgb,var(--accent-blue)_8%,var(--bg-primary))]"
                  : ""
              }`}
            >
              <span className="w-[62px] shrink-0 text-right text-[11px] tabular-nums text-[var(--text-muted)]">
                {stamp(run.at, now)}
              </span>
              <span className="flex min-w-0 flex-1 items-baseline gap-1.5">
                {job.emoji && <span className="shrink-0 text-[12px]">{job.emoji}</span>}
                <span
                  className={`min-w-0 truncate text-[13px] text-[var(--text-primary)] ${
                    unread > 0 ? "font-semibold" : "font-medium"
                  }`}
                >
                  {jobName(job)}
                </span>
              </span>
              <span
                className={`flex min-w-0 max-w-[55%] items-center gap-1.5 text-[11px] tabular-nums ${
                  unread > 0
                    ? "font-medium text-[var(--accent-blue-text)]"
                    : "text-[var(--text-muted)]"
                }`}
              >
                <span
                  aria-hidden
                  className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                    unread > 0
                      ? "bg-[var(--accent-blue)]"
                      : TONE_DOT_CLASS[jobResultTone(run.result)]
                  }`}
                />
                <span className="min-w-0 truncate">
                  {unread > 0 ? `${unread > 9 ? "9+" : unread} new` : outcome}
                </span>
                <span className="shrink-0 whitespace-nowrap text-[var(--text-muted)]">
                  · {ageLabel(run.at)}
                </span>
              </span>
            </button>
          );
        })
      )}
    </aside>
  );
}

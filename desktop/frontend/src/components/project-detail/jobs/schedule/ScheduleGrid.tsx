import { Fragment } from "react";
import type { JobInfo } from "../../../../jobsFormat";
import type { Board, BoardCell, BoardDay } from "../../../../scheduleBoard";
import { formatClock } from "../../../../scheduleBoard";
import { ScheduleBlock } from "./ScheduleBlock";

type BoardJob = JobInfo & { project?: string };

interface ScheduleGridProps {
  board: Board;
  now: number;
  scopeLabelFor: (job: BoardJob) => string;
  onOpen: (job: BoardJob) => void;
}

const WEEKDAY = new Intl.DateTimeFormat(undefined, { weekday: "short" });

const QUIET_HATCH =
  "repeating-linear-gradient(135deg, color-mix(in srgb, var(--text-muted) 9%, transparent) 0 3px, transparent 3px 7px)";

function hourLabel(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`;
}

function isWeekend(day: BoardDay): boolean {
  return day.weekday === "sat" || day.weekday === "sun";
}

function cellTint(day: BoardDay): string {
  if (day.isToday) {
    return "bg-[color-mix(in_srgb,var(--accent-blue)_5%,var(--bg-primary))]";
  }
  if (isWeekend(day)) {
    return "bg-[color-mix(in_srgb,var(--text-primary)_4%,var(--bg-primary))]";
  }
  return "";
}

export function ScheduleGrid({ board, now, scopeLabelFor, onOpen }: ScheduleGridProps) {
  if (board.rows.length === 0) return null;

  const nowHour = new Date(now * 1000).getHours();

  const renderCell = (cell: BoardCell, showNowLine: boolean) => {
    const total = cell.items.length + cell.hidden;
    return (
      <div
        key={cell.day.start}
        className={`flex min-h-[34px] min-w-0 flex-col gap-[3px] border-l border-t border-[var(--border)] p-1 ${cellTint(
          cell.day,
        )} ${cell.day.isPast && !cell.day.isToday ? "opacity-80" : ""}`}
      >
        {total > 1 && (
          <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
            {total} at once
            <span className="h-px flex-1 bg-[var(--border)]" />
          </span>
        )}
        {cell.items.map((occurrence) => (
          <ScheduleBlock
            key={occurrence.key}
            occurrence={occurrence}
            scopeLabel={scopeLabelFor(occurrence.job)}
            now={now}
            onOpen={() => onOpen(occurrence.job)}
          />
        ))}
        {cell.hidden > 0 && (
          <span className="block truncate pl-1 text-[10px] text-[var(--text-muted)]">
            +{cell.hidden} more
          </span>
        )}
        {showNowLine && (
          <span className="relative mt-auto block h-px bg-[var(--text-primary)]">
            <span className="absolute -top-2 left-0 rounded-[3px] bg-[var(--text-primary)] px-1 text-[10px] font-bold tabular-nums text-[var(--bg-primary)]">
              {formatClock(now)} now
            </span>
          </span>
        )}
      </div>
    );
  };

  return (
    <div
      role="group"
      aria-label="Week schedule"
      className="grid min-w-0 grid-cols-[52px_repeat(7,minmax(0,1fr))] overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg-primary)]"
    >
      <div className="sticky top-0 z-10 border-b border-[var(--border)] bg-[var(--bg-secondary)] px-2 py-1.5 text-[10px] uppercase tracking-[0.08em] text-[var(--text-muted)]">
        Time
      </div>
      {board.days.map((day) => (
        <div
          key={day.start}
          className={`sticky top-0 z-10 flex min-w-0 items-baseline gap-1.5 border-b border-l border-[var(--border)] px-2 py-1.5 text-[11px] ${
            day.isToday
              ? "bg-[color-mix(in_srgb,var(--accent-blue)_12%,var(--bg-secondary))]"
              : "bg-[var(--bg-secondary)]"
          } ${day.isPast && !day.isToday ? "opacity-70" : ""}`}
        >
          <span
            className={`truncate font-semibold ${
              day.isToday ? "text-[var(--accent-blue-text)]" : "text-[var(--text-primary)]"
            }`}
          >
            {WEEKDAY.format(day.date)}
          </span>
          <span className="tabular-nums text-[var(--text-muted)]">{day.date.getDate()}</span>
          {day.isToday && (
            <span className="ml-auto shrink-0 rounded-[3px] bg-[var(--accent-blue)] px-1.5 text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--bg-primary)]">
              Today
            </span>
          )}
        </div>
      ))}

      {board.rows.map((row) => {
        const span = `${hourLabel(row.band.fromHour)} – ${hourLabel(row.band.toHour)}`;
        if (row.kind === "quiet") {
          return (
            <Fragment key={`quiet-${row.band.fromHour}`}>
              <div className="border-t border-[var(--border)] pr-1.5 pt-1 text-right text-[10px] leading-tight tabular-nums text-[var(--text-muted)]">
                {hourLabel(row.band.fromHour)}
                <span className="block opacity-80">{hourLabel(row.band.toHour)}</span>
              </div>
              <div
                className="col-span-7 flex min-h-[20px] items-center justify-center border-l border-t border-[var(--border)] text-[10px] text-[var(--text-muted)]"
                style={{ backgroundImage: QUIET_HATCH }}
              >
                nothing scheduled {span}
              </div>
            </Fragment>
          );
        }
        const holdsNow = nowHour >= row.band.fromHour && nowHour < row.band.toHour;
        return (
          <Fragment key={`band-${row.band.fromHour}`}>
            <div
              className="border-t border-[var(--border)] pr-1.5 pt-1 text-right text-[10px] leading-tight tabular-nums text-[var(--text-muted)]"
              title={span}
            >
              {hourLabel(row.band.fromHour)}
              <span className="block opacity-80">{hourLabel(row.band.toHour)}</span>
            </div>
            {row.cells.map((cell) => renderCell(cell, holdsNow && cell.day.isToday))}
          </Fragment>
        );
      })}
    </div>
  );
}

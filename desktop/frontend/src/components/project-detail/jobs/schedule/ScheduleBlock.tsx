import type { CSSProperties } from "react";
import {
  formatRunningFor,
  formatSchedule,
  jobResultLabel,
  jobResultTone,
  TONE_DOT_CLASS,
} from "../../../../jobsFormat";
import type { JobOccurrence } from "../../../../jobsOccurrences";
import { formatClock, jobName, untilLabel } from "../../../../scheduleBoard";
import { accentTextVar, accentVar, colorProject } from "../../../../scheduleColors";
import { relativeTime } from "../../../../relativeTime";

interface ScheduleBlockProps {
  occurrence: JobOccurrence;
  // Resolved project label for the block's tooltip, e.g. "karucapatoxic".
  scopeLabel: string;
  now: number;
  onOpen: () => void;
}

type OccurrenceJob = JobOccurrence["job"];

const EXACT = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const HATCH =
  "repeating-linear-gradient(135deg, color-mix(in srgb, var(--text-muted) 16%, transparent) 0 3px, transparent 3px 6px)";


// The board draws an approximate slot softly; the tooltip has to say what the
// schedule actually leaves to chance, so a guess never reads as a promise.
function approximateReason(job: OccurrenceJob): string {
  const schedule = job.schedule;
  if (schedule?.mode === "calendar") {
    if (schedule.pickDays) return "Expected — the days are drawn at random each week";
    if (schedule.untilMinutes !== undefined) {
      return "Expected — the minute is drawn from the window";
    }
  }
  if (schedule?.mode === "interval" && schedule.everyMaxSecs) {
    return "Expected — the gap between runs varies";
  }
  return "Expected — the exact time isn't fixed";
}

function statePhrase(occurrence: JobOccurrence, now: number): string {
  switch (occurrence.state) {
    case "running":
      return formatRunningFor(occurrence.job.runningSince, now * 1000);
    case "ran": {
      const label = jobResultLabel(occurrence.result) || "Ran";
      const ago = relativeTime(occurrence.at);
      return ago === "now" ? `${label}, just now` : `${label}, ${ago} ago`;
    }
    case "due":
      return `Due ${untilLabel(occurrence.at, now)}`;
    case "past":
      return "Was due — no run recorded";
    case "paused":
      return "Paused — would have run here";
  }
}

export function ScheduleBlock({ occurrence, scopeLabel, now, onOpen }: ScheduleBlockProps) {
  const { job, state, at, untilAt, approximate, count } = occurrence;
  const tone = jobResultTone(occurrence.result);
  const unread = job.unread ?? 0;
  // A finished run wears its outcome rather than its project: a failure has to
  // read as one wherever it sits on the board.
  const failed = state === "ran" && tone === "error";
  const inert = state === "paused";

  const accent = failed
    ? "var(--accent-red)"
    : state === "running"
      ? "var(--accent-cyan)"
      : inert
        ? "var(--text-muted)"
        : accentVar(colorProject(job));
  const accentText = failed
    ? "var(--accent-red-text)"
    : state === "running"
      ? "var(--accent-cyan-text)"
      : inert
        ? "var(--text-muted)"
        : accentTextVar(colorProject(job));

  const filled = state === "ran" || state === "running";
  const style = {
    "--blk-bg": filled
      ? `color-mix(in srgb, ${accent} 16%, var(--bg-primary))`
      : state === "due"
        ? `color-mix(in srgb, ${accent} 8%, var(--bg-primary))`
        : "transparent",
    "--blk-bg-hover": `color-mix(in srgb, ${accent} 24%, var(--bg-primary))`,
    "--blk-text": accentText,
    backgroundImage: inert ? HATCH : undefined,
    borderStyle: filled ? "solid" : state === "past" ? "dotted" : "dashed",
    borderWidth: "1px",
    borderColor: `color-mix(in srgb, ${accent} 40%, var(--bg-primary))`,
    borderLeftWidth: "3px",
    // A dashed leading edge is the one mark an approximate slot always carries,
    // so it survives greyscale and never depends on the hue alone.
    borderLeftStyle: approximate || inert ? "dashed" : "solid",
    borderLeftColor: accent,
  } as CSSProperties;

  const timeText =
    untilAt !== undefined
      ? `${formatClock(at)}–${formatClock(untilAt)}`
      : `${approximate ? "~" : ""}${formatClock(at)}`;
  const badge = failed
    ? "failed"
    : state === "running"
      ? "running"
      : inert
        ? "paused"
        : state === "ran" && tone === "warning"
          ? "held"
          : "";

  const exact =
    untilAt !== undefined
      ? `${EXACT.format(at * 1000)} – ${formatClock(untilAt)}`
      : EXACT.format(at * 1000);
  const title = [
    jobName(job),
    scopeLabel,
    job.schedule ? formatSchedule(job.schedule) : "",
    exact,
    statePhrase(occurrence, now),
    approximate ? approximateReason(job) : "",
    count > 1 ? `${count} runs in this slot` : "",
    unread > 0 ? `${unread} new ${unread === 1 ? "message" : "messages"}` : "",
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <button
      type="button"
      onClick={onOpen}
      title={title}
      aria-label={title}
      style={style}
      className={`block w-full min-w-0 rounded-md bg-[var(--blk-bg)] py-[3px] pl-1 pr-1.5 text-left transition-colors hover:bg-[var(--blk-bg-hover)] ${
        state === "past" ? "opacity-75 hover:opacity-100" : ""
      }`}
    >
      <span className="flex min-w-0 items-center gap-1 whitespace-nowrap text-[10px] font-bold tabular-nums text-[var(--blk-text)]">
        {state === "running" ? (
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent-cyan)] motion-safe:animate-pulse" />
        ) : (
          state === "ran" && (
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${TONE_DOT_CLASS[tone]}`} />
          )
        )}
        <span className="truncate">{timeText}</span>
        {badge && (
          <span className="shrink-0 rounded-[3px] bg-[color-mix(in_srgb,var(--text-primary)_10%,var(--bg-primary))] px-1 text-[10px] uppercase tracking-[0.08em] text-[var(--text-secondary)]">
            {badge}
          </span>
        )}
        {count > 1 && <span className="shrink-0 font-semibold">× {count}</span>}
        {unread > 0 && state === "ran" && (
          <span className="ml-auto shrink-0 rounded-full bg-[var(--accent-blue)] px-1 text-[10px] font-bold text-[var(--bg-primary)]">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </span>
      <span
        className={`block truncate text-[11px] leading-tight ${
          inert ? "text-[var(--text-secondary)]" : "text-[var(--text-primary)]"
        }`}
      >
        {job.emoji && <span className="mr-1 text-[10px]">{job.emoji}</span>}
        {jobName(job)}
      </span>
    </button>
  );
}

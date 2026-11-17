import { ClockIcon } from "../../icons";
import { StatusChip } from "../../ui/StatusChip";
import { hasOnOffSwitch } from "../../../jobsList";
import { JobRowTrailing, type JobRowAction } from "./JobRowTrailing";
import { jobNeedsAnswer, jobRowChip, jobRowPreview, lastRunFailed, type JobPreviewTone } from "./jobRowPreview";
import { relativeAgo } from "../../../relativeTime";
import { holdsJob, waitingAsks } from "../../../jobAsk";
import { nextRunLabel } from "../../../jobNextRun";
import { useNow } from "../../../hooks/useNow";
import {
  formatRunningFor,
  formatSchedule,
  jobRunPlace,
  type JobInfo,
} from "../../../jobsFormat";

interface JobRowProps {
  job: JobInfo;
  // Which projects the job runs in, shown on the row itself so the list can
  // stay flat instead of grouping by project.
  scopeLabel?: string;
  // A rule above the row, inset to its text column.
  divider?: boolean;
  onRunNow: (id: string) => void;
  onStop: (id: string) => void;
  onToggleEnabled: (id: string, enabled: boolean) => void;
  onOpen: (job: JobInfo) => void;
  onEdit: (job: JobInfo) => void;
  onRemove: (job: JobInfo) => void;
}

// The line under the name stays in the body colour; only a warning, which has
// no chip of its own, is tinted, and a quiet line is muted.
function toneClass(tone: JobPreviewTone): string {
  if (tone === "warning") return "text-[var(--accent-amber-text)]";
  return tone === "muted" ? "text-[var(--text-muted)]" : "text-[var(--text-secondary)]";
}

// One automation as a conversation in a messenger list: who it is, where and
// when it runs, and the last thing it said. A question or a failed run puts a
// chip on that line and its button in the row's right-hand column.
export function JobRow({ job, scopeLabel, divider, onRunNow, onStop, onToggleEnabled, onOpen, onEdit, onRemove }: JobRowProps) {
  const now = useNow(job.running === true);
  const unread = job.unread ?? 0;
  // Every project it runs in is archived, so its schedule waits for one to come back.
  const archived = (job.targets?.length ?? 0) > 0 && job.archivedTargets?.length === job.targets?.length;
  const enabled = job.enabled;
  const off = job.valid && (!enabled || archived);
  const asks = waitingAsks(job);
  const held = asks.some(holdsJob);
  const switchable = job.valid && hasOnOffSwitch(job);
  // A repo-declared job lives in the repo's own config file, which stays the
  // user's to edit — no delete from here.
  const removable = job.source !== "repo";

  // A shared job runs in many folders at once, so its "running" line aggregates
  // how many are live rather than a single elapsed clock.
  const runningFor = formatRunningFor(job.runningSince, now);
  const elapsedSuffix = runningFor.startsWith("Running —")
    ? runningFor.slice("Running".length)
    : "";
  const runningText =
    job.targetCount && job.targetCount > 1
      ? `Running in ${job.runningCount ?? 0} of ${job.targetCount}${elapsedSuffix}`
      : runningFor;
  const place = jobRunPlace(job);
  const preview = jobRowPreview(job, place ? `${runningText} · ${place}` : runningText);

  const meta = [
    scopeLabel,
    job.source === "repo" ? "in repo" : "",
    job.valid && job.schedule ? formatSchedule(job.schedule) : "",
    job.lastRunAt ? `ran ${relativeAgo(job.lastRunAt)}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  const nextRun = job.valid && enabled && !archived ? nextRunLabel(job.nextFireAt) : "";

  const answering = jobNeedsAnswer(job);
  const action: JobRowAction = answering ? "answer" : lastRunFailed(job) ? "retry" : null;
  const chip = jobRowChip(job, preview);

  return (
    <div className="group relative flex items-start gap-3 rounded-xl py-3 pl-1 pr-3 transition-colors focus-within:bg-[var(--bg-secondary)] hover:bg-[var(--bg-secondary)]">
      {divider && (
        <span aria-hidden className="absolute left-[78px] right-3 top-0 h-px bg-[var(--border)]" />
      )}
      <span className="flex w-2.5 shrink-0 justify-center pt-4">
        {unread > 0 && !chip && (
          <span aria-label="Unread" className="h-2 w-2 rounded-full bg-[var(--accent-blue)]" />
        )}
      </span>
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[var(--bg-hover)] text-[19px] text-[var(--text-muted)]">
        <span className={`grid place-items-center transition-opacity ${off ? "opacity-60" : ""}`}>
          {job.emoji || <ClockIcon size={18} />}
        </span>
      </span>

      <span className="min-w-0 flex-1">
        <button
          type="button"
          onClick={() => (job.valid ? onOpen(job) : onEdit(job))}
          className="block w-full min-w-0 text-left"
        >
          <span className="flex min-w-0 items-baseline gap-2">
            <span
              className={`min-w-0 max-w-[70%] shrink-0 truncate text-[14px] ${
                off ? "text-[var(--text-secondary)]" : "text-[var(--text-primary)]"
              } ${unread > 0 ? "font-semibold" : "font-medium"}`}
            >
              {job.label || job.id}
            </span>
            {meta && (
              <span className="min-w-0 shrink-[4] truncate text-[12px] text-[var(--text-muted)]">
                {meta}
              </span>
            )}
          </span>
          <span
            className={`mt-1 line-clamp-2 break-words text-[13px] leading-[1.5] [overflow-wrap:anywhere] ${
              toneClass(off ? "muted" : answering ? "unread" : preview.tone)
            }`}
          >
            {chip && (
              <StatusChip tone={chip.tone} className="mr-2 align-[1px]">
                {chip.label}
              </StatusChip>
            )}
            {archived && !chip && (
              <StatusChip tone="attention" className="mr-2 align-[1px]">
                Paused · project archived
              </StatusChip>
            )}
            {!off && preview.tone === "running" && (
              <span
                aria-hidden
                className="mr-2 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--accent-green)] align-[2px]"
              />
            )}
            {preview.prefix && !answering && (
              <span className="font-medium text-[var(--text-primary)]">{preview.prefix}</span>
            )}
            {preview.text}
          </span>
        </button>
      </span>

      <JobRowTrailing
        label={job.label || job.id}
        valid={job.valid}
        enabled={enabled}
        running={job.running === true}
        held={held}
        removable={removable}
        switchable={switchable}
        action={action}
        nextRun={nextRun}
        onAnswer={() => onOpen(job)}
        onRunNow={() => onRunNow(job.id)}
        onStop={() => onStop(job.id)}
        onEdit={() => onEdit(job)}
        onRemove={() => onRemove(job)}
        onToggleEnabled={(next) => onToggleEnabled(job.id, next)}
      />
    </div>
  );
}

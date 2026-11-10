import { ClockIcon, PencilIcon, StopIcon, TrashIcon } from "../../icons";
import { hasOnOffSwitch } from "../../../jobsList";
import { PlayIcon } from "../icons";
import { Switch } from "../../ui/Switch";
import { HoverActionButton } from "./HoverActionButton";
import { JobRowRetry } from "./JobRowRetry";
import { jobRowPreview, lastRunFailed, type JobPreviewTone } from "./jobRowPreview";
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
  onRunNow: (id: string) => void;
  onStop: (id: string) => void;
  onToggleEnabled: (id: string, enabled: boolean) => void;
  onOpen: (job: JobInfo) => void;
  onEdit: (job: JobInfo) => void;
  onRemove: (job: JobInfo) => void;
}

const TONE_CLASS: Record<JobPreviewTone, string> = {
  error: "text-[var(--accent-red-text)]",
  warning: "text-[var(--accent-amber-text)]",
  running: "text-[var(--accent-cyan-text)]",
  unread: "text-[var(--text-secondary)]",
  muted: "text-[var(--text-muted)]",
};

// One automation as a conversation in a messenger list: who it is, where and
// when it runs, and the last thing it said. Its next run sits beside the on/off
// switch, and its buttons take that place while the row is hovered.
export function JobRow({ job, scopeLabel, onRunNow, onStop, onToggleEnabled, onOpen, onEdit, onRemove }: JobRowProps) {
  const now = useNow(job.running === true);
  const unread = job.unread ?? 0;
  const enabled = job.enabled;
  const off = job.valid && !enabled;
  // A question asked without a key holds every run until it's answered.
  const held = waitingAsks(job).some(holdsJob);
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
  const nextRun = job.valid && enabled ? nextRunLabel(job.nextFireAt) : "";

  return (
    <div className="group flex items-start gap-3 rounded-[14px] py-3 pl-1 pr-3 transition-colors focus-within:bg-[var(--bg-secondary)] hover:bg-[var(--bg-secondary)]">
      <span className="flex w-2.5 shrink-0 justify-center pt-[19px]">
        {unread > 0 && (
          <span aria-hidden className="h-[9px] w-[9px] rounded-full bg-[var(--accent-blue)]" />
        )}
      </span>
      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[var(--bg-hover)] text-[23px] text-[var(--text-muted)]">
        <span className={`grid place-items-center transition-[opacity,filter] ${off ? "opacity-40 grayscale" : ""}`}>
          {job.emoji || <ClockIcon size={20} />}
        </span>
      </span>

      <span className="min-w-0 flex-1">
        <button
          type="button"
          onClick={() => (job.valid ? onOpen(job) : onEdit(job))}
          className="block w-full min-w-0 pt-0.5 text-left"
        >
          <span className="flex min-w-0 items-baseline gap-2">
            <span
              className={`min-w-0 max-w-[70%] shrink-0 truncate text-[14.5px] ${
                enabled || !job.valid ? "text-[var(--text-primary)]" : "text-[var(--text-muted)]"
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
            className={`mt-1 line-clamp-2 break-words text-[13.5px] leading-[1.45] [overflow-wrap:anywhere] ${
              TONE_CLASS[off ? "muted" : preview.tone]
            }`}
          >
            {preview.prefix && (
              <span className="font-medium text-[var(--text-primary)]">{preview.prefix}</span>
            )}
            {preview.text}
          </span>
        </button>
        {lastRunFailed(job) && (
          <JobRowRetry onRetry={() => onRunNow(job.id)} onOpen={() => onOpen(job)} />
        )}
      </span>

      <span className="flex shrink-0 items-center gap-3 self-center">
        <span className="flex h-[30px] items-center">
          <span className="flex flex-col items-end leading-tight group-focus-within:hidden group-hover:hidden">
            {nextRun && (
              <>
                <span className="text-[12px] font-medium tabular-nums text-[var(--text-secondary)]">{nextRun}</span>
                <span className="text-[11px] text-[var(--text-muted)]">next run</span>
              </>
            )}
            {off && <span className="text-[12px] font-medium text-[var(--text-muted)]">Off</span>}
          </span>
          <span className="hidden items-center gap-1 group-focus-within:flex group-hover:flex">
            {job.valid &&
              (job.running ? (
                <HoverActionButton label="Stop run" title="Stop" danger onClick={() => onStop(job.id)}>
                  <StopIcon />
                </HoverActionButton>
              ) : (
                enabled && (
                  <HoverActionButton
                    label="Run now"
                    title={held ? "Answer or skip its question first" : undefined}
                    disabled={held}
                    onClick={() => onRunNow(job.id)}
                  >
                    <PlayIcon />
                  </HoverActionButton>
                )
              ))}
            <HoverActionButton label="Edit automation" title="Edit" onClick={() => onEdit(job)}>
              <PencilIcon size={13} />
            </HoverActionButton>
            {removable && (
              <HoverActionButton label="Remove automation" title="Remove" danger onClick={() => onRemove(job)}>
                <TrashIcon size={13} />
              </HoverActionButton>
            )}
          </span>
        </span>
        {switchable && (
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            aria-label={job.label || job.id}
            title={enabled ? "Turn off" : "Turn on"}
            onClick={() => onToggleEnabled(job.id, !enabled)}
            className="-m-1 flex rounded-full p-1"
          >
            <Switch checked={enabled} />
          </button>
        )}
      </span>
    </div>
  );
}

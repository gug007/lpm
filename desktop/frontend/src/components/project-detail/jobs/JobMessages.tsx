import { useEffect, useRef, useState } from "react";
import { JobHistory } from "../../../../bridge/commands";
import { Switch } from "../../ui/Switch";
import { MessageMarkdown } from "../../MessageMarkdown";
import { ChevronLeftIcon, ClockIcon, PencilIcon } from "../../icons";
import { PlayIcon } from "../icons";
import { relativeTime } from "../../../relativeTime";
import {
  formatNextRun,
  formatSchedule,
  jobResultLabel,
  jobResultTone,
  TONE_DOT_CLASS,
  type JobHistoryEntry,
  type JobInfo,
} from "../../../jobsFormat";

function ago(at: number): string {
  const t = relativeTime(at);
  return t === "now" ? "just now" : `${t} ago`;
}

interface JobMessagesProps {
  project: string;
  job: JobInfo;
  refreshKey: number;
  onBack: () => void;
  onEdit: () => void;
  onRunNow: () => void;
  onToggleEnabled: (enabled: boolean) => void;
  onOpenCopy: (project: string) => void;
}

export function JobMessages({
  project,
  job,
  refreshKey,
  onBack,
  onEdit,
  onRunNow,
  onToggleEnabled,
  onOpenCopy,
}: JobMessagesProps) {
  const [entries, setEntries] = useState<JobHistoryEntry[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    JobHistory(project, job.id)
      .then((rows) => {
        if (!cancelled) setEntries((rows as JobHistoryEntry[]) ?? []);
      })
      .catch(() => {
        if (!cancelled) setEntries([]);
      });
    return () => {
      cancelled = true;
    };
  }, [project, job.id, refreshKey]);

  const scheduleText = job.schedule ? formatSchedule(job.schedule) : "";
  const nextRunText = job.enabled ? formatNextRun(job.nextFireAt) : "Paused";
  const meta = [project, scheduleText, nextRunText].filter(Boolean).join(" · ");

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex items-center gap-3 pt-6">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to all jobs"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
        >
          <ChevronLeftIcon />
        </button>
        <span className="grid h-8 w-8 shrink-0 place-items-center text-[17px] text-[var(--text-muted)]">
          {job.emoji || <ClockIcon size={16} />}
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-semibold tracking-tight">
            {job.label || job.id}
          </h1>
          <p className="truncate text-[11px] text-[var(--text-muted)]">{meta}</p>
        </div>
        <button
          type="button"
          onClick={onRunNow}
          className="flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
        >
          <PlayIcon />
          Run now
        </button>
        <button
          type="button"
          onClick={onEdit}
          className="flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
        >
          <PencilIcon size={12} />
          Edit
        </button>
        <button
          type="button"
          role="switch"
          aria-checked={job.enabled}
          aria-label={job.enabled ? "Pause job" : "Resume job"}
          onClick={() => onToggleEnabled(!job.enabled)}
          className="shrink-0"
        >
          <Switch checked={job.enabled} />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto pb-6 pt-5">
        {!job.valid ? (
          <p className="py-10 text-center text-[12px] text-[var(--accent-red)]">
            {job.error || "This job can't run — edit it to fix its settings."}
          </p>
        ) : entries === null ? (
          <p className="py-10 text-center text-[12px] text-[var(--text-muted)]">
            Loading…
          </p>
        ) : entries.length === 0 ? (
          <p className="py-10 text-center text-[12px] text-[var(--text-muted)]">
            No runs yet — use Run now to try it.
          </p>
        ) : (
          <div className="space-y-3">
            {[...entries].reverse().map((entry, i) => (
              <Message
                key={`${entry.at}-${i}`}
                entry={entry}
                onOpenCopy={onOpenCopy}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const COLLAPSED_MAX_PX = 340;

function Message({
  entry,
  onOpenCopy,
}: {
  entry: JobHistoryEntry;
  onOpenCopy: (project: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = bodyRef.current;
    if (el) setOverflows(el.scrollHeight > COLLAPSED_MAX_PX + 40);
  }, [entry.output]);

  const copyOutput = () => {
    if (!entry.output) return;
    void navigator.clipboard.writeText(entry.output);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const header = (
    <div className="group flex items-center gap-2.5">
      <span
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${TONE_DOT_CLASS[jobResultTone(entry.result)]}`}
      />
      <span className="min-w-0 flex-1 truncate text-[12.5px] text-[var(--text-secondary)]">
        {jobResultLabel(entry.result)}
        {entry.copy && (
          <>
            {" in "}
            <button
              type="button"
              onClick={() => onOpenCopy(entry.copy as string)}
              className="font-medium text-[var(--accent-cyan)] hover:underline"
            >
              {entry.copy}
            </button>
          </>
        )}
      </span>
      {entry.output && (
        <button
          type="button"
          onClick={copyOutput}
          className="shrink-0 text-[11px] font-medium text-[var(--text-muted)] opacity-0 transition-all hover:text-[var(--text-primary)] focus-visible:opacity-100 group-hover:opacity-100"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      )}
      <span className="shrink-0 text-[11px] tabular-nums text-[var(--text-muted)]">
        {ago(entry.at)}
      </span>
    </div>
  );

  if (!entry.output) {
    return <div className="px-1 py-1">{header}</div>;
  }
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)]/40 px-4 py-3">
      {header}
      <div
        ref={bodyRef}
        className="mt-2.5 overflow-hidden border-t border-[var(--border)] pt-2.5"
        style={expanded ? undefined : { maxHeight: COLLAPSED_MAX_PX }}
      >
        <MessageMarkdown text={entry.output} />
      </div>
      {overflows && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-2 w-full text-center text-[11px] font-medium text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  DeleteJobHistory,
  JobHistory,
  SendJobFollowup,
} from "../../../../bridge/commands";
import { MessageMarkdown } from "../../MessageMarkdown";
import { ConfirmDialog } from "../../ui/ConfirmDialog";
import { JobLiveOutput } from "./JobLiveOutput";
import {
  ArrowUpIcon,
  ChevronLeftIcon,
  ClockIcon,
  StopIcon,
  TrashIcon,
} from "../../icons";
import { relativeTime } from "../../../relativeTime";
import { useNow } from "../../../hooks/useNow";
import { RowSelect } from "./RowSelect";
import { effortsFor, MODEL_OPTIONS } from "../../../agentModelOptions";
import {
  formatCost,
  formatDuration,
  formatRunningFor,
  groupJobThreads,
  jobResultLabel,
  jobResultTone,
  jobThreadTail,
  TONE_DOT_CLASS,
  type JobHistoryEntry,
  type JobInfo,
} from "../../../jobsFormat";

function ago(at: number): string {
  const t = relativeTime(at);
  return t === "now" ? "just now" : `${t} ago`;
}

interface JobTaskViewProps {
  project: string;
  job: JobInfo;
  // The `at` of the run entry whose conversation this page shows.
  rootAt: number;
  refreshKey: number;
  onBack: () => void;
  onStop: () => void;
  onChanged: () => void;
  onOpenCopy: (project: string) => void;
}

// One run of a scheduled job as its own page: the run's output, the
// conversation that grew out of it, and the reply box to continue it.
export function JobTaskView({
  project,
  job,
  rootAt,
  refreshKey,
  onBack,
  onStop,
  onChanged,
  onOpenCopy,
}: JobTaskViewProps) {
  const [entries, setEntries] = useState<JobHistoryEntry[] | null>(null);
  const [reload, setReload] = useState(0);
  const [draft, setDraft] = useState("");
  // "agent|model", seeded from the job so a reply runs like the job by default.
  const [pick, setPick] = useState(`${job.agent ?? ""}|${job.model ?? ""}`);
  const [effort, setEffort] = useState(job.effort ?? "");
  const [sendError, setSendError] = useState<string | null>(null);
  // The just-sent message, echoed into the page until its answer entry lands.
  const [pending, setPending] = useState<{ text: string; baseCount: number } | null>(null);
  const [removing, setRemoving] = useState<{ at: number; whole: boolean } | null>(null);
  const [removeCopy, setRemoveCopy] = useState(false);
  const sawRunning = useRef(false);
  const replyRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrolledOnce = useRef(false);
  const nearBottom = useRef(true);
  const now = useNow(job.running === true);

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
  }, [project, job.id, refreshKey, reload]);

  const thread =
    entries === null
      ? undefined
      : groupJobThreads(entries).find((t) => t.root.at === rootAt);
  const replies = thread?.replies ?? [];

  // The conversation is gone — removed, or scrolled off the history cap.
  useEffect(() => {
    if (entries !== null && !thread) onBack();
  }, [entries, thread, onBack]);

  useEffect(() => {
    if (pending && replies.length > pending.baseCount) setPending(null);
  }, [replies.length, pending]);

  // Backstop: if the run came and went without landing a reply entry, don't
  // leave a ghost bubble behind.
  useEffect(() => {
    if (job.running) {
      sawRunning.current = true;
    } else if (sawRunning.current) {
      sawRunning.current = false;
      setPending(null);
    }
  }, [job.running]);

  // The reply box grows with its draft, up to a few lines.
  useEffect(() => {
    const el = replyRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [draft]);

  useEffect(() => {
    if (entries === null) return;
    const el = scrollRef.current;
    if (!el) return;
    if (!scrolledOnce.current || nearBottom.current) {
      scrolledOnce.current = true;
      el.scrollTop = el.scrollHeight;
    }
  }, [entries, pending]);

  // Live output grows outside React's knowledge of "content changed" — keep
  // the page pinned to the newest lines only while the user is already there.
  const followGrowth = () => {
    requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (el && nearBottom.current) el.scrollTop = el.scrollHeight;
    });
  };

  const [agent, model] = pick.split("|");
  const efforts = effortsFor(agent);
  const locked = job.running === true;
  // Every conversation of an AI prompt job stays continuable: a Claude session
  // resumes, anything else continues from the condensed transcript.
  const canReply = job.valid && job.runKind === "prompt";

  const send = async () => {
    if (!thread) return;
    const message = draft.trim();
    if (!message || locked) return;
    setSendError(null);
    try {
      await SendJobFollowup(
        project,
        job.id,
        jobThreadTail(thread).at,
        message,
        agent,
        model,
        effort,
      );
      setPending({ text: message, baseCount: replies.length });
      setDraft("");
    } catch (err) {
      setSendError(err instanceof Error ? err.message : String(err));
    }
  };

  // The copy this conversation worked in, offered for removal with the run.
  const threadCopy = thread
    ? [thread.root, ...thread.replies].find((e) => e.copy)?.copy
    : undefined;

  const removeConfirmed = async () => {
    if (!removing) return;
    const { at, whole } = removing;
    const alsoCopy = whole && removeCopy && !!threadCopy;
    setRemoving(null);
    try {
      await DeleteJobHistory(project, job.id, at, whole, alsoCopy);
      onChanged();
      if (whole) onBack();
      else setReload((n) => n + 1);
    } catch (err) {
      // Nothing was removed — stay on the page and say why.
      toast.error(err instanceof Error ? err.message : String(err));
      onChanged();
      setReload((n) => n + 1);
    }
  };

  const root = thread?.root;
  const meta = root
    ? [project, jobResultLabel(root.result), ago(root.at)].join(" · ")
    : project;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex items-center gap-3 pt-6">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to the job"
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
        {job.running && (
          <button
            type="button"
            onClick={onStop}
            className="flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--accent-red)]"
          >
            <StopIcon />
            Stop
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            setRemoveCopy(false);
            setRemoving({ at: rootAt, whole: true });
          }}
          disabled={locked}
          title="Remove this run"
          aria-label="Remove this run"
          className="flex shrink-0 items-center rounded-md p-2 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--accent-red)] disabled:opacity-40"
        >
          <TrashIcon size={13} />
        </button>
      </div>

      <div
        ref={scrollRef}
        onScroll={() => {
          const el = scrollRef.current;
          if (el) {
            nearBottom.current =
              el.scrollHeight - el.scrollTop - el.clientHeight < 80;
          }
        }}
        className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto pb-4 pt-5"
      >
        {!thread ? (
          <p className="py-10 text-center text-[12px] text-[var(--text-muted)]">
            Loading…
          </p>
        ) : (
          <>
            <EntryBody
              entry={thread.root}
              onOpenCopy={onOpenCopy}
              onOpenProject={() => onOpenCopy(project)}
              first
            />
            {replies.map((reply, i) => (
              <EntryBody
                key={`${reply.at}-${i}`}
                entry={reply}
                onOpenCopy={onOpenCopy}
                onOpenProject={() => onOpenCopy(project)}
                onRemove={
                  locked ? undefined : () => setRemoving({ at: reply.at, whole: false })
                }
              />
            ))}
            {/* Scoped to `pending` (a reply sent from this page): the job's
                other runs — a scheduled fire, another thread's reply — belong
                to other conversations and must not render here. */}
            {pending && (
              <div className="mt-6">
                <div className="mb-2 flex justify-end">
                  <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-[var(--bg-secondary)] px-4 py-2.5 text-[13px] leading-relaxed text-[var(--text-primary)]">
                    {pending.text}
                  </div>
                </div>
                <div className="flex items-center gap-2.5 px-1 py-2">
                  <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-[var(--accent-cyan)]" />
                  <span className="min-w-0 flex-1 truncate text-[12.5px] text-[var(--text-secondary)]">
                    {formatRunningFor(job.runningSince, now)}
                  </span>
                  <button
                    type="button"
                    onClick={onStop}
                    className="shrink-0 text-[11px] font-medium text-[var(--text-muted)] transition-colors hover:text-[var(--accent-red)]"
                  >
                    Stop
                  </button>
                </div>
                <JobLiveOutput
                  project={project}
                  jobId={job.id}
                  running={job.running === true}
                  onGrow={followGrowth}
                />
              </div>
            )}
          </>
        )}
      </div>

      {canReply && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
          className="pb-5 pt-2"
        >
          <div
            className={`rounded-2xl border border-[var(--border)] bg-[var(--bg-secondary)]/40 px-4 pb-2.5 pt-3 transition-colors focus-within:border-[var(--accent-cyan)] ${
              locked ? "opacity-60" : ""
            }`}
          >
            <textarea
              ref={replyRef}
              value={draft}
              rows={1}
              onChange={(e) => {
                setDraft(e.target.value);
                setSendError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              placeholder={locked ? "Waiting for the run to finish…" : "Reply…"}
              disabled={locked}
              className="block w-full resize-none border-none bg-transparent text-[13px] leading-relaxed text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
            />
            <div className="mt-2 flex items-center gap-1.5">
              <RowSelect
                value={pick}
                onChange={(v) => {
                  setPick(v);
                  const nextEfforts = effortsFor(v.split("|")[0]);
                  if (!nextEfforts.some((e) => e.value === effort)) setEffort("");
                }}
                options={MODEL_OPTIONS}
              />
              {efforts.length > 0 && (
                <RowSelect value={effort} onChange={setEffort} options={efforts} />
              )}
              <span className="min-w-0 flex-1" />
              <button
                type="submit"
                disabled={!draft.trim() || locked}
                aria-label="Send reply"
                className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[var(--text-primary)] text-[var(--bg-primary)] transition-opacity hover:opacity-90 disabled:opacity-25"
              >
                <ArrowUpIcon />
              </button>
            </div>
          </div>
          {sendError && (
            <p className="mt-1.5 px-1 text-[11px] text-[var(--accent-red)]">{sendError}</p>
          )}
        </form>
      )}

      <ConfirmDialog
        open={removing !== null}
        title={removing?.whole ? "Remove this run?" : "Remove this message?"}
        body={
          removing?.whole ? (
            <>
              The run and its replies are removed from this job's history. This
              cannot be undone.
              {threadCopy && (
                <label className="mt-3 flex cursor-pointer items-center gap-1.5 text-[12px] text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]">
                  <input
                    type="checkbox"
                    checked={removeCopy}
                    onChange={(e) => setRemoveCopy(e.target.checked)}
                    className="accent-[var(--accent-blue)] h-3 w-3"
                  />
                  Also remove {threadCopy}, the copy it worked in
                </label>
              )}
            </>
          ) : (
            "The message is removed from this job's history. This cannot be undone."
          )
        }
        confirmLabel="Remove"
        variant="destructive"
        onCancel={() => setRemoving(null)}
        onConfirm={() => void removeConfirmed()}
      />
    </div>
  );
}

function EntryHeader({
  entry,
  onOpenCopy,
  onOpenProject,
  onRemove,
  quiet,
}: {
  entry: JobHistoryEntry;
  onOpenCopy: (project: string) => void;
  // Jump to the project a non-copy run worked in — the path to reviewing what
  // a full-access run just changed.
  onOpenProject?: () => void;
  onRemove?: () => void;
  // A reply that simply succeeded needs no status line — just a small
  // trailing meta under its message.
  quiet?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  const copyOutput = () => {
    if (!entry.output) return;
    void navigator.clipboard.writeText(entry.output);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const stats = [
    entry.durationSecs !== undefined && entry.durationSecs > 0
      ? formatDuration(entry.durationSecs)
      : "",
    entry.costUsd !== undefined ? formatCost(entry.costUsd) : "",
  ]
    .filter(Boolean)
    .join(" · ");

  if (quiet) {
    return (
      <div className="mt-1.5 flex items-center justify-end gap-2.5">
        {onOpenProject && !entry.copy && (
          <button
            type="button"
            onClick={onOpenProject}
            className="text-[11px] font-medium text-[var(--text-muted)] opacity-0 transition-opacity hover:text-[var(--text-primary)] focus-visible:opacity-100 group-hover:opacity-100"
          >
            Open project
          </button>
        )}
        {entry.output && (
          <button
            type="button"
            onClick={copyOutput}
            className="text-[11px] font-medium text-[var(--text-muted)] opacity-0 transition-opacity hover:text-[var(--text-primary)] focus-visible:opacity-100 group-hover:opacity-100"
          >
            {copied ? "Copied" : "Copy"}
          </button>
        )}
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="text-[11px] font-medium text-[var(--text-muted)] opacity-0 transition-opacity hover:text-[var(--accent-red)] focus-visible:opacity-100 group-hover:opacity-100"
          >
            Remove
          </button>
        )}
        <span
          title={
            entry.compacted
              ? "The original conversation ran out of room, so this reply continued in a fresh one seeded with a condensed history."
              : new Date(entry.at * 1000).toLocaleString()
          }
          className="text-[11px] tabular-nums text-[var(--text-muted)]"
        >
          {[stats, entry.compacted ? "Condensed" : "", ago(entry.at)]
            .filter(Boolean)
            .join(" · ")}
        </span>
      </div>
    );
  }

  return (
    <div className="group flex items-center gap-2.5">
      <span
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${TONE_DOT_CLASS[jobResultTone(entry.result)]}`}
      />
      <span className="min-w-0 flex-1 truncate text-[12.5px] text-[var(--text-secondary)]">
        {jobResultLabel(entry.result)}
        {(entry.count ?? 1) > 1 && ` × ${entry.count}`}
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
      {stats && (
        <span className="shrink-0 text-[11px] tabular-nums text-[var(--text-muted)]">
          {stats}
        </span>
      )}
      {entry.compacted && (
        <span
          title="The original conversation ran out of room, so this reply continued in a fresh one seeded with a condensed history."
          className="shrink-0 text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--text-muted)]"
        >
          Condensed
        </span>
      )}
      {entry.result === "completed" && !entry.copy && onOpenProject && (
        <button
          type="button"
          onClick={onOpenProject}
          className="shrink-0 text-[11px] font-medium text-[var(--text-muted)] opacity-0 transition-all hover:text-[var(--text-primary)] focus-visible:opacity-100 group-hover:opacity-100"
        >
          Open project
        </button>
      )}
      {entry.output && (
        <button
          type="button"
          onClick={copyOutput}
          className="shrink-0 text-[11px] font-medium text-[var(--text-muted)] opacity-0 transition-all hover:text-[var(--text-primary)] focus-visible:opacity-100 group-hover:opacity-100"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      )}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="shrink-0 text-[11px] font-medium text-[var(--text-muted)] opacity-0 transition-all hover:text-[var(--accent-red)] focus-visible:opacity-100 group-hover:opacity-100"
        >
          Remove
        </button>
      )}
      <span
        title={new Date(entry.at * 1000).toLocaleString()}
        className="shrink-0 text-[11px] tabular-nums text-[var(--text-muted)]"
      >
        {ago(entry.at)}
      </span>
    </div>
  );
}

// One message in the conversation: the user's question (for replies), the
// status line, and the agent's full markdown output — this is the message's
// own page, so nothing is folded away.
function EntryBody({
  entry,
  onOpenCopy,
  onOpenProject,
  onRemove,
  first,
}: {
  entry: JobHistoryEntry;
  onOpenCopy: (project: string) => void;
  onOpenProject?: () => void;
  onRemove?: () => void;
  first?: boolean;
}) {
  // A reply that simply succeeded reads as chat — its answer speaks for
  // itself; the status line stays for the run itself and anything unusual.
  const quiet = !first && entry.result === "completed";

  return (
    <div className={`group ${first ? "" : "mt-6"}`}>
      {entry.question && (
        <div className="mb-2.5 flex justify-end">
          <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-[var(--bg-secondary)] px-4 py-2.5 text-[13px] leading-relaxed text-[var(--text-primary)]">
            {entry.question}
          </div>
        </div>
      )}
      {!quiet && (
        <EntryHeader
          entry={entry}
          onOpenCopy={onOpenCopy}
          onOpenProject={onOpenProject}
          onRemove={onRemove}
        />
      )}
      {entry.output && (
        <div className="mt-2">
          <MessageMarkdown text={entry.output} />
        </div>
      )}
      {quiet && (
        <EntryHeader
          entry={entry}
          onOpenCopy={onOpenCopy}
          onOpenProject={onOpenProject}
          onRemove={onRemove}
          quiet
        />
      )}
    </div>
  );
}

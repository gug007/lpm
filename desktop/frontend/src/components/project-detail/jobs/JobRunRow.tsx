import { ChevronRightIcon } from "../../icons";
import { relativeTime } from "../../../relativeTime";
import {
  formatCost,
  formatDuration,
  jobOutputSnippet,
  jobResultLabel,
  jobResultTone,
  jobThreadTail,
  TONE_DOT_CLASS,
  type JobThread,
} from "../../../jobsFormat";

function ago(at: number): string {
  const t = relativeTime(at);
  return t === "now" ? "just now" : `${t} ago`;
}

// One run of a job as a list row: outcome and vitals on the first line, a
// couple of clamped lines of the latest message below. Opens the run's own
// page when there is a conversation to show.
export function JobRunRow({
  thread,
  onOpen,
  onOpenCopy,
  onRemove,
}: {
  thread: JobThread;
  onOpen?: () => void;
  onOpenCopy: (project: string) => void;
  onRemove?: () => void;
}) {
  const root = thread.root;
  const tail = jobThreadTail(thread);
  const snippet = jobOutputSnippet(tail.output, 320);
  const replies = thread.replies.length;
  const stats = [
    replies > 0 ? `${replies} ${replies === 1 ? "reply" : "replies"}` : "",
    root.durationSecs !== undefined && root.durationSecs > 0
      ? formatDuration(root.durationSecs)
      : "",
    root.costUsd !== undefined ? formatCost(root.costUsd) : "",
  ]
    .filter(Boolean)
    .join(" · ");
  const label = `${jobResultLabel(root.result, root.copy)}${
    (root.count ?? 1) > 1 ? ` × ${root.count}` : ""
  }`;

  const content = (
    <>
      <span className="flex min-w-0 items-baseline gap-2">
        <span className="min-w-0 truncate text-[13px] font-medium text-[var(--text-primary)]">
          {label}
        </span>
        {stats && (
          <span className="shrink-0 text-[11px] tabular-nums text-[var(--text-muted)]">
            {stats}
          </span>
        )}
      </span>
      {snippet && (
        <span
          className="mt-0.5 block text-[12px] leading-relaxed text-[var(--text-muted)]"
          style={{
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {snippet}
        </span>
      )}
    </>
  );

  return (
    <div
      className={`group flex gap-3 rounded-lg px-2 py-3 transition-colors ${
        onOpen ? "hover:bg-[var(--bg-hover)]" : ""
      }`}
    >
      <span
        className={`mt-[6px] h-1.5 w-1.5 shrink-0 rounded-full ${TONE_DOT_CLASS[jobResultTone(root.result)]}`}
      />
      {onOpen ? (
        <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
          {content}
        </button>
      ) : (
        <span className="min-w-0 flex-1">{content}</span>
      )}
      <span className="flex shrink-0 items-center gap-2.5 self-start pt-px">
        {root.copy && (
          <button
            type="button"
            onClick={() => onOpenCopy(root.copy as string)}
            className="text-[11px] font-medium text-[var(--text-muted)] opacity-0 transition-opacity hover:text-[var(--text-primary)] focus-visible:opacity-100 group-hover:opacity-100"
          >
            Open copy
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
          title={new Date(tail.at * 1000).toLocaleString()}
          className="text-[11px] tabular-nums text-[var(--text-muted)]"
        >
          {ago(tail.at)}
        </span>
        {onOpen && (
          <span className="scale-90 text-[var(--text-muted)] opacity-0 transition-opacity group-hover:opacity-100">
            <ChevronRightIcon />
          </span>
        )}
      </span>
    </div>
  );
}

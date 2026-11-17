import { askSummary, waitingAsks, WAITING_LABEL } from "../../../jobAsk";
import {
  formatDuration,
  isBlockedResult,
  jobOutputSnippet,
  jobResultLabel,
  jobResultTone,
  type JobInfo,
} from "../../../jobsFormat";

export type JobPreviewTone = "error" | "warning" | "running" | "unread" | "muted";

export interface JobPreview {
  prefix: string;
  text: string;
  tone: JobPreviewTone;
}

const FAILURE_NOTE_CHARS = 240;

// A failed last run is news on an automation that is on and not doing anything
// else right now; one that's off waits for whoever turns it back on.
export function lastRunFailed(job: JobInfo): boolean {
  return (
    job.valid &&
    job.enabled &&
    !job.running &&
    waitingAsks(job).length === 0 &&
    jobResultTone(job.lastResult) === "error"
  );
}

// A question of the job's waits for an answer: the row offers Answer and the
// list's Needs you filter keeps it.
export function jobNeedsAnswer(job: JobInfo): boolean {
  return job.valid && waitingAsks(job).length > 0;
}

export interface JobRowChip {
  label: string;
  tone: "attention" | "danger";
}

// What a row needs from the user, worn ahead of its line: a question waiting, a
// failed run, or a job that can't run. An automation that's off has none.
export function jobRowChip(job: JobInfo, preview: JobPreview): JobRowChip | null {
  if (job.valid && !job.enabled) return null;
  if (jobNeedsAnswer(job)) {
    const count = waitingAsks(job).length;
    return { label: count > 1 ? `${count} questions` : "Needs you", tone: "attention" };
  }
  if (preview.tone === "error") return { label: job.valid ? "Failed" : "Can't run", tone: "danger" };
  return null;
}

// A failed run says how long it ran and why it failed, when its machine
// recorded a reason; older machines only send the result.
function failedPreview(job: JobInfo): JobPreview {
  const label = jobResultLabel(job.lastResult);
  const ran = job.lastDurationSecs ? ` after ${formatDuration(job.lastDurationSecs)}` : "";
  const note = jobOutputSnippet(job.lastNote, FAILURE_NOTE_CHARS);
  return {
    prefix: "",
    text: note ? `${label}${ran} · ${note}` : `${label}${ran}. Open it to see what happened.`,
    tone: "error",
  };
}

// The second line of a job row: what the job last said, unless something about
// its state matters more right now.
export function jobRowPreview(job: JobInfo, runningText: string): JobPreview {
  if (!job.valid) {
    return {
      prefix: "",
      text: job.error || "This job can't run — open it to fix its settings.",
      tone: "error",
    };
  }
  const asks = waitingAsks(job);
  if (asks.length > 0) {
    const prefix = asks.length > 1 ? `${asks.length} questions waiting · ` : `${WAITING_LABEL} · `;
    return { prefix, text: askSummary(asks[0]), tone: "warning" };
  }
  if (job.running) return { prefix: "", text: runningText, tone: "running" };
  if (isBlockedResult(job.lastResult)) {
    return { prefix: "", text: jobResultLabel(job.lastResult), tone: "warning" };
  }
  const resultTone = jobResultTone(job.lastResult);
  if (resultTone === "error") return failedPreview(job);
  if (resultTone === "warning") {
    return { prefix: "", text: jobResultLabel(job.lastResult), tone: "warning" };
  }
  const unread = job.unread ?? 0;
  const snippet = jobOutputSnippet(job.lastMessage, 320);
  const description = job.description?.replace(/\s+/g, " ").trim() ?? "";
  return {
    prefix: unread > 1 ? `${unread > 9 ? "9+" : unread} new · ` : "",
    text: snippet || description || jobResultLabel(job.lastResult) || "No runs yet",
    tone: unread > 0 ? "unread" : "muted",
  };
}

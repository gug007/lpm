import { useMemo } from "react";
import { liveOutputTail } from "../../../jobsFormat";
import { useJobLiveText } from "./useJobLiveText";

// The tail of a running job's live output, polled while the run works so the
// page shows what the agent is doing instead of a bare spinner. Until the run
// has said something it shows the placeholder. No reply means no run here to
// wait on: a shared job's may be in another project.
export function JobLiveOutput({
  project,
  jobId,
  running,
  placeholder,
}: {
  project: string;
  jobId: string;
  running: boolean;
  placeholder: string;
}) {
  const { text: live, waiting } = useJobLiveText(project, jobId, running);
  const text = useMemo(() => liveOutputTail(live), [live]);

  if (!running) return null;
  if (!text) {
    return waiting ? (
      <p className="text-[12px] text-[var(--text-muted)]">{placeholder}</p>
    ) : null;
  }

  return (
    <div className="mt-1 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)]/40 px-3 py-2.5">
      <pre className="max-w-full whitespace-pre-wrap break-words font-mono text-[11px] leading-[1.7] text-[var(--text-muted)]">
        {text}
      </pre>
    </div>
  );
}

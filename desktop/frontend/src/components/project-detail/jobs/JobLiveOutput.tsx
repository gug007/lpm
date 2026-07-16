import { useEffect, useRef, useState } from "react";
import { JobLiveOutput as FetchJobLiveOutput } from "../../../../bridge/commands";
import { liveOutputTail } from "../../../jobsFormat";

const POLL_MS = 2000;

// The tail of a running job's live output, polled while the run works so the
// page shows what the agent is doing instead of a bare spinner. Renders
// nothing until the run has said something.
export function JobLiveOutput({
  project,
  jobId,
  running,
  onGrow,
}: {
  project: string;
  jobId: string;
  running: boolean;
  // The tail changed — lets a scroll-anchored host follow the growth.
  onGrow?: () => void;
}) {
  const [text, setText] = useState("");
  const lastText = useRef("");
  const onGrowRef = useRef(onGrow);
  onGrowRef.current = onGrow;

  useEffect(() => {
    if (!running) {
      lastText.current = "";
      setText("");
      return;
    }
    let cancelled = false;
    const poll = async () => {
      try {
        const res = (await FetchJobLiveOutput(project, jobId)) as {
          text?: string;
        } | null;
        if (cancelled) return;
        const tail = liveOutputTail(res?.text);
        if (tail !== lastText.current) {
          lastText.current = tail;
          setText(tail);
          onGrowRef.current?.();
        }
      } catch {
        // A failed poll keeps the last tail; the next one retries.
      }
    };
    void poll();
    const id = window.setInterval(() => void poll(), POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [project, jobId, running]);

  if (!running || !text) return null;

  return (
    <div className="mt-1 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)]/40 px-3 py-2.5">
      <pre className="max-w-full whitespace-pre-wrap break-words font-mono text-[11px] leading-[1.7] text-[var(--text-muted)]">
        {text}
      </pre>
    </div>
  );
}

import { useMemo } from "react";
import { MessageMarkdown } from "../../MessageMarkdown";
import { liveParts, stepsLabel } from "../../../jobLive";
import { useJobLiveText } from "./useJobLiveText";

// What a running agent has said so far, read like its finished messages: its
// words in full, and each burst of tool calls folded onto one line.
export function JobLiveConversation({
  project,
  jobId,
  running,
  onGrow,
}: {
  project: string;
  jobId: string;
  running: boolean;
  onGrow?: () => void;
}) {
  const { text, waiting } = useJobLiveText(project, jobId, running, onGrow);
  const parts = useMemo(() => liveParts(text), [text]);

  if (!running) return null;
  if (parts.length === 0) {
    return waiting ? (
      <p className="text-[12.5px] text-[var(--text-muted)]">Nothing said yet — it's starting.</p>
    ) : null;
  }

  return (
    <div className="flex flex-col gap-2">
      {parts.map((part, i) =>
        part.kind === "text" ? (
          <MessageMarkdown key={i} text={part.text} />
        ) : (
          <span
            key={i}
            title={part.names.join(" → ")}
            className="w-fit rounded-md border border-[var(--border)] px-2 py-0.5 font-mono text-[11px] text-[var(--text-muted)]"
          >
            → {stepsLabel(part.names)}
            {part.names.length > 1 && ` · ${part.names.length} steps`}
          </span>
        ),
      )}
    </div>
  );
}

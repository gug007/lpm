import type { CSSProperties } from "react";
import type { JobAsk } from "../../../jobAsk";
import { JobAskCard } from "./JobAskCard";

// Questions a job waits on, stacked; nothing at all when there are none.
export function JobAskCards({
  asks,
  project,
  jobId,
  onAnswered,
  className = "",
  style,
}: {
  asks: JobAsk[];
  project: string;
  jobId: string;
  onAnswered?: () => void;
  className?: string;
  style?: CSSProperties;
}) {
  if (asks.length === 0) return null;
  return (
    <div className={`flex flex-col gap-3 ${className}`} style={style}>
      {asks.map((ask) => (
        <JobAskCard key={ask.id} ask={ask} project={project} jobId={jobId} onAnswered={onAnswered} />
      ))}
    </div>
  );
}

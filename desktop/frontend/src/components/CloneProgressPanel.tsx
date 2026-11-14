import { LoaderCircle } from "lucide-react";
import { CheckIcon } from "./icons";
import {
  CLONE_PHASES,
  countLabel,
  phaseInfo,
  phaseMarks,
  type CloneProgress,
  type PhaseMark,
} from "../clone/cloneProgress";

interface Props {
  progress: CloneProgress | null;
  host: string;
  cancelling: boolean;
}

const MARK_TEXT: Record<PhaseMark, string> = {
  done: "text-[var(--text-secondary)]",
  current: "font-medium text-[var(--text-primary)]",
  todo: "text-[var(--text-muted)]",
};

function markIcon(mark: PhaseMark) {
  if (mark === "done") {
    return (
      <span className="flex text-[var(--accent-green-text)]">
        <CheckIcon />
      </span>
    );
  }
  if (mark === "current") {
    return <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--accent-cyan)]" />;
  }
  return <span className="h-2 w-2 rounded-full border border-[var(--text-muted)] opacity-60" />;
}

export function CloneProgressPanel({ progress, host, cancelling }: Props) {
  const percent = cancelling ? null : (progress?.percent ?? null);
  const title = cancelling
    ? "Stopping git and deleting the partial folder…"
    : progress
      ? phaseInfo(progress.phase).title
      : `Connecting to ${host || "the repository"}…`;
  const transfer = progress ? [progress.size, progress.speed].filter(Boolean).join(" · ") : "";
  const count = progress && !cancelling ? countLabel(progress) : null;
  const marks = phaseMarks(progress);

  return (
    <div
      aria-live="polite"
      className="mt-4 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3.5 py-3"
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="flex min-w-0 items-center gap-1.5 text-[12.5px] font-medium text-[var(--text-primary)]">
          {cancelling && <LoaderCircle size={12} className="shrink-0 animate-spin" />}
          <span className="truncate">{title}</span>
        </span>
        {percent != null && (
          <span className="shrink-0 text-[12px] tabular-nums text-[var(--text-secondary)]">{percent}%</span>
        )}
      </div>
      <div
        role="progressbar"
        aria-label={title}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent ?? undefined}
        className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--bg-hover)]"
      >
        <div
          className={`h-full rounded-full bg-[var(--accent-cyan)] transition-[width] duration-200 ${percent == null ? "w-1/3 animate-pulse" : ""}`}
          style={percent == null ? undefined : { width: `${percent}%` }}
        />
      </div>
      {(transfer || count) && (
        <div className="mt-1.5 flex justify-between gap-3 text-[11px] tabular-nums text-[var(--text-muted)]">
          <span className="truncate">{transfer}</span>
          {count && <span className="shrink-0">{count}</span>}
        </div>
      )}
      <ol className="mt-3 flex flex-wrap gap-x-3 gap-y-1">
        {CLONE_PHASES.map((p) => (
          <li
            key={p.key}
            aria-current={marks[p.key] === "current" ? "step" : undefined}
            className={`inline-flex items-center gap-1.5 text-[11px] ${MARK_TEXT[marks[p.key]]}`}
          >
            {markIcon(marks[p.key])}
            {p.short}
          </li>
        ))}
      </ol>
    </div>
  );
}

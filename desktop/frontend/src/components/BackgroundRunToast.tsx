import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Ban, Check, ChevronDown, CircleAlert, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import {
  clearBackgroundRun,
  getBackgroundRunLines,
  subscribeBackgroundRun,
} from "../store/backgroundRuns";

export type BackgroundRunStatus = "running" | "success" | "error" | "cancelled";

interface BackgroundRunToastProps {
  runId: string;
  label: string;
  status: BackgroundRunStatus;
  startedAt: number;
  error?: string;
  onCancel: () => void;
  onDismiss: () => void;
}

function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function StatusIcon({ status }: { status: BackgroundRunStatus }) {
  switch (status) {
    case "running":
      return <Loader2 size={15} className="animate-spin text-[var(--text-muted)]" />;
    case "success":
      return <Check size={15} className="text-[var(--accent-green)]" />;
    case "error":
      return <CircleAlert size={15} className="text-[var(--accent-red)]" />;
    case "cancelled":
      return <Ban size={14} className="text-[var(--text-muted)]" />;
  }
}

export function BackgroundRunToast({
  runId,
  label,
  status,
  startedAt,
  error,
  onCancel,
  onDismiss,
}: BackgroundRunToastProps) {
  const lines = useSyncExternalStore(
    (cb) => subscribeBackgroundRun(runId, cb),
    () => getBackgroundRunLines(runId),
  );
  const [expanded, setExpanded] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const running = status === "running";

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [running]);

  const outputRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = outputRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines, expanded]);

  return (
    <div
      className={`overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] shadow-xl transition-[width,margin-left] duration-200 ${
        expanded ? "-ml-[284px] w-[640px]" : "ml-0 w-[356px]"
      }`}
    >
      <div className="flex items-center gap-2 px-3 py-2.5">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center">
          <StatusIcon status={status} />
        </span>
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-[var(--text-primary)]">
          {label}
        </span>
        <span className="shrink-0 text-[11px] tabular-nums text-[var(--text-muted)]">
          {formatElapsed((running ? now : Date.now()) - startedAt)}
        </span>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex shrink-0 items-center gap-0.5 rounded-md px-1.5 py-1 text-[11px] text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
        >
          Output
          <ChevronDown
            size={12}
            className={`transition-transform ${expanded ? "rotate-180" : ""}`}
          />
        </button>
        {running ? (
          <button
            type="button"
            onClick={onCancel}
            className="shrink-0 rounded-md border border-[var(--border)] px-2 py-0.5 text-[11px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
          >
            Cancel
          </button>
        ) : (
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss"
            className="shrink-0 rounded-md p-1 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
          >
            <X size={13} />
          </button>
        )}
      </div>
      {status === "error" && error && (
        <div className="break-words px-3 pb-2.5 text-[11px] leading-snug text-[var(--accent-red)]">
          {error}
        </div>
      )}
      {expanded && (
        <div
          ref={outputRef}
          className="max-h-44 select-text overflow-y-auto border-t border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 font-mono text-[11px] leading-relaxed text-[var(--text-secondary)]"
        >
          {lines.length === 0 ? (
            <span className="text-[var(--text-muted)]">
              {running ? "Waiting for output…" : "No output"}
            </span>
          ) : (
            lines.map((line, i) => (
              <div key={i} className="whitespace-pre-wrap break-all">
                {line || "\u00A0"}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export function showBackgroundRunToast(opts: {
  runId: string;
  label: string;
  status: BackgroundRunStatus;
  startedAt: number;
  error?: string;
  onCancel: () => void;
}) {
  const id = `bg-run-${opts.runId}`;
  toast.custom(
    () => (
      <BackgroundRunToast
        {...opts}
        onDismiss={() => {
          toast.dismiss(id);
          clearBackgroundRun(opts.runId);
        }}
      />
    ),
    {
      id,
      duration:
        opts.status === "running" || opts.status === "error" ? Infinity : 4000,
      onAutoClose: () => clearBackgroundRun(opts.runId),
    },
  );
}

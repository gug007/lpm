import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Ban, Check, ChevronDown, CircleAlert, Copy, Loader2, X } from "lucide-react";
import { useConfirmFlash } from "../hooks/useConfirmFlash";
import { toast } from "../notifications/toast";
import {
  clearBackgroundRun,
  getBackgroundRunLines,
  subscribeBackgroundRun,
} from "../store/backgroundRuns";
import {
  type BackgroundRunStatus,
  backgroundRunDuration,
  failureText,
  formatElapsed,
} from "./backgroundRunToastText";

export type { BackgroundRunStatus };

interface BackgroundRunToastProps {
  runId: string;
  label: string;
  status: BackgroundRunStatus;
  startedAt: number;
  endedAt?: number;
  error?: string;
  onCancel: () => void;
  onExpand: () => void;
  onResize: () => void;
  onDismiss: () => void;
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
  endedAt,
  error,
  onCancel,
  onExpand,
  onResize,
  onDismiss,
}: BackgroundRunToastProps) {
  const lines = useSyncExternalStore(
    (cb) => subscribeBackgroundRun(runId, cb),
    () => getBackgroundRunLines(runId),
  );
  const [expanded, setExpanded] = useState(false);
  const [copied, flashCopied] = useConfirmFlash();
  const [now, setNow] = useState(() => Date.now());
  const running = status === "running";

  const copyOutput = () => {
    void navigator.clipboard.writeText(lines.join("\n"));
    flashCopied();
  };

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

  // sonner keeps the height it measured when the toast was last shown and
  // stretches the toast to it on hover, so a card that grew or shrank since
  // (output opened or closed, lines streaming in, the width easing) would jump
  // out from under the pointer. Showing it again has sonner measure it anew.
  // A closed toast's card leaves the page and measures 0 before this effect is
  // cleaned up; showing it then would bring the toast straight back.
  const cardRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    let height = card.offsetHeight;
    const observer = new ResizeObserver(() => {
      if (!card.isConnected || card.offsetHeight === height) return;
      height = card.offsetHeight;
      onResize();
    });
    observer.observe(card);
    return () => observer.disconnect();
  }, [onResize]);

  return (
    <div
      ref={cardRef}
      className={`toast-surface overflow-hidden transition-[width,margin-left] duration-200 ${
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
          {formatElapsed((running ? now : endedAt ?? now) - startedAt)}
        </span>
        {lines.length > 0 && (
          <button
            type="button"
            onClick={copyOutput}
            title={copied ? "Copied" : "Copy output"}
            aria-label={copied ? "Copied" : "Copy output"}
            className={`flex shrink-0 items-center justify-center rounded-md p-1 transition-colors hover:bg-[var(--bg-hover)] ${
              copied
                ? "text-[var(--accent-green)]"
                : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            }`}
          >
            {copied ? <Check size={13} /> : <Copy size={13} />}
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            if (!expanded) onExpand();
            setExpanded(!expanded);
          }}
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
          {failureText(error, expanded && lines.length > 0)}
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

// Runs whose output the user opened: their toast stays until dismissed.
const pinnedRuns = new Set<string>();

export function showBackgroundRunToast(opts: {
  runId: string;
  label: string;
  status: BackgroundRunStatus;
  startedAt: number;
  error?: string;
  onCancel: () => void;
}) {
  const id = `bg-run-${opts.runId}`;
  const endedAt = opts.status === "running" ? undefined : Date.now();
  const release = () => {
    pinnedRuns.delete(opts.runId);
    clearBackgroundRun(opts.runId);
  };
  const show = () =>
    toast.custom(
      () => (
        <BackgroundRunToast
          {...opts}
          endedAt={endedAt}
          onExpand={() => {
            if (pinnedRuns.has(opts.runId)) return;
            pinnedRuns.add(opts.runId);
            show();
          }}
          onResize={show}
          onDismiss={() => toast.dismiss(id)}
        />
      ),
      {
        id,
        duration: backgroundRunDuration(opts.status, pinnedRuns.has(opts.runId)),
        onAutoClose: release,
        onDismiss: release,
      },
    );
  show();
}

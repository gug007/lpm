import { X } from "lucide-react";
import { toast } from "../notifications/toast";
import { FOOTER_TOASTER_ID } from "../toasterOffset";

interface UndoCloseToastProps {
  toastId: string;
  title: string;
  detail?: string;
  durationMs: number;
  onUndo: () => void;
}

export function UndoCloseToast({ toastId, title, detail, durationMs, onUndo }: UndoCloseToastProps) {
  return (
    <div className="toast-surface group relative flex w-max min-w-[300px] max-w-[356px] items-center gap-2 overflow-hidden py-1.5 pl-3.5 pr-2">
      <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--text-primary)]">
        {title}
        {detail && <span className="text-[var(--text-muted)]"> · {detail}</span>}
      </span>
      <button
        type="button"
        onClick={onUndo}
        className="shrink-0 rounded-md px-2 py-1 text-[13px] font-medium text-[var(--accent-blue)] transition-colors hover:bg-[var(--bg-hover)]"
      >
        Undo
      </button>
      <button
        type="button"
        onClick={() => toast.dismiss(toastId)}
        aria-label="Dismiss"
        className="flex shrink-0 items-center justify-center rounded-md p-1 text-[var(--text-muted)] opacity-0 transition-[opacity,color,background-color] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] group-hover:opacity-100"
      >
        <X size={13} />
      </button>
      <span className="toast-countdown" style={{ animationDuration: `${durationMs}ms` }} aria-hidden />
    </div>
  );
}

export function showUndoCloseToast(opts: {
  toastId: string;
  title: string;
  detail?: string;
  durationMs: number;
  // Ends on time in a hidden window too, where the toast's clock stands still:
  // closed by a phone, a command or an agent that is done, what ran there would
  // go on until the window is next shown.
  endsHidden?: boolean;
  onUndo: () => void;
  onFinalize: () => void;
}) {
  toast.custom(
    () => (
      <UndoCloseToast
        toastId={opts.toastId}
        title={opts.title}
        detail={opts.detail}
        durationMs={opts.durationMs}
        onUndo={opts.onUndo}
      />
    ),
    {
      id: opts.toastId,
      duration: opts.durationMs,
      toasterId: FOOTER_TOASTER_ID,
      onAutoClose: opts.onFinalize,
      onDismiss: opts.onFinalize,
    },
  );
  if (opts.endsHidden && document.hidden) {
    setTimeout(() => document.hidden && opts.onFinalize(), opts.durationMs);
  }
}

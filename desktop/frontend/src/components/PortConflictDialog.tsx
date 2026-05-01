import { main } from "../../wailsjs/go/models";
import { Modal } from "./ui/Modal";

interface Props {
  open: boolean;
  projectName: string;
  conflicts: main.PortConflictInfo[];
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function PortConflictDialog({
  open,
  projectName,
  conflicts,
  busy,
  onCancel,
  onConfirm,
}: Props) {
  const hasUnknown = conflicts.some((c) => !c.lpmProject && c.pid <= 0);
  const plural = conflicts.length > 1;

  return (
    <Modal
      open={open}
      onClose={onCancel}
      closeOnBackdrop={!busy}
      closeOnEscape={!busy}
      contentClassName="w-[440px] overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)] shadow-2xl"
    >
      <div className="px-6 pt-6 pb-5">
        <h2 className="text-base font-semibold text-[var(--text-primary)]">
          Cannot start "{projectName}"
        </h2>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          {hasUnknown
            ? "Some ports are held by processes we couldn't identify. Free them manually before continuing."
            : `Stop the ${plural ? "holders" : "holder"} below to start the project.`}
        </p>

        <div className="mt-5 max-h-[280px] space-y-1.5 overflow-y-auto">
          {conflicts.map((c) => (
            <div
              key={`${c.service}-${c.port}`}
              className="rounded-lg bg-[var(--bg-secondary)] px-3.5 py-2.5"
            >
              <div className="flex items-center gap-2.5">
                <span className="font-mono text-sm font-semibold text-[var(--text-primary)] tabular-nums">
                  {c.port}
                </span>
                <span className="text-xs text-[var(--text-muted)]">
                  {c.service}
                </span>
              </div>
              <p className="mt-0.5 text-xs">
                <span className="text-[var(--text-muted)]">used by </span>
                <span className="text-[var(--text-secondary)]">
                  {c.description}
                </span>
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="flex justify-end gap-2 border-t border-[var(--border)] bg-[var(--bg-secondary)] px-5 py-3">
        <button
          onClick={onCancel}
          disabled={busy}
          className="rounded-lg border border-[var(--border)] px-3.5 py-1.5 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-40"
        >
          Cancel
        </button>
        <button
          onClick={onConfirm}
          disabled={busy || hasUnknown}
          className="rounded-lg bg-[var(--accent-red)] px-3.5 py-1.5 text-sm font-medium text-white shadow-sm transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? "Stopping…" : "Stop & start"}
        </button>
      </div>
    </Modal>
  );
}

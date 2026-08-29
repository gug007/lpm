import { useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { Modal } from "../ui/Modal";
import { SURFACE_TOKENS } from "./surfaces";

interface ToolkitSkillModalProps {
  // The tab this was opened from is showing. A hidden tab hides the dialog
  // without unmounting it, so switching away and back keeps the draft.
  open: boolean;
  title: string;
  subtitle: string;
  // The line beside the buttons: why the primary is off, or what ↩ will do.
  hint: ReactNode;
  submitLabel: string;
  busyLabel: string;
  busy: boolean;
  blocked: boolean;
  // Whether leaving would throw work away, and what to call it if it would.
  dirty: boolean;
  discardTitle: string;
  discardBody: string;
  onClose: () => void;
  onSubmit: () => void;
  children: ReactNode;
}

// The frame both skill forms are written in — writing a skill and changing one
// are the same act, so they are the same dialog. A dialog rather than a
// sub-view of the pane: the pane can sit at 300px beside a terminal, which is
// narrower than this form deserves, and either job is a detour from reading the
// list rather than a place in it.
export function ToolkitSkillModal({
  open,
  title,
  subtitle,
  hint,
  submitLabel,
  busyLabel,
  busy,
  blocked,
  dirty,
  discardTitle,
  discardBody,
  onClose,
  onSubmit,
  children,
}: ToolkitSkillModalProps) {
  const [discarding, setDiscarding] = useState(false);

  const close = () => {
    if (dirty) setDiscarding(true);
    else onClose();
  };

  return (
    <Modal
      open={open}
      onClose={close}
      // The discard guard is a dialog of its own: while it is up, Escape and a
      // click outside belong to it. Neither closes this one mid-write either.
      closeOnEscape={!discarding && !busy}
      closeOnBackdrop={!discarding && !busy}
      contentClassName="flex max-h-[88vh] w-[min(960px,94vw)] flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)] shadow-2xl"
    >
      {/* The dialog is portalled out of the pane, so it carries the pane's
          surface tokens itself — the fields and the notices mix their colours
          from them, and an undefined custom property paints nothing at all. */}
      <div style={SURFACE_TOKENS} className="flex min-h-0 flex-1 flex-col">
        <div className="flex shrink-0 items-start gap-3 px-6 pb-1 pt-6">
          <div className="min-w-0">
            <h3 className="text-[15px] font-semibold leading-tight text-[var(--text-primary)]">
              {title}
            </h3>
            <p className="mt-1 text-[12px] leading-snug text-[var(--text-muted)]">{subtitle}</p>
          </div>
          <button
            type="button"
            onClick={close}
            title="Close (esc)"
            aria-label="Close"
            className="-mr-1 -mt-1 ml-auto shrink-0 rounded-md p-1 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
          >
            <X size={16} />
          </button>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              onSubmit();
            }
          }}
          className="flex min-h-0 flex-1 flex-col"
        >
          <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6 pt-5">
            <div className="flex flex-col gap-3">{children}</div>
          </div>

          <div className="flex shrink-0 items-center gap-2 border-t border-[var(--border)] px-6 pb-6 pt-4">
            <span className="min-w-0 flex-1 truncate text-[12px] text-[var(--text-muted)]">
              {hint}
            </span>
            <button
              type="button"
              onClick={close}
              className="rounded-lg px-4 py-2 text-[13px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={blocked || busy}
              title="⌘↩"
              className="rounded-lg bg-[var(--text-primary)] px-4 py-2 text-[13px] font-medium text-[var(--bg-primary)] shadow-sm transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              {busy ? busyLabel : submitLabel}
            </button>
          </div>
        </form>
      </div>

      <ConfirmDialog
        open={discarding}
        title={discardTitle}
        body={discardBody}
        cancelLabel="Keep editing"
        confirmLabel="Discard"
        zIndexClassName="z-[70]"
        onCancel={() => setDiscarding(false)}
        onConfirm={onClose}
      />
    </Modal>
  );
}

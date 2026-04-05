import type { ReactNode } from "react";
import { Modal } from "./Modal";

export type ConfirmVariant = "default" | "destructive";

interface ConfirmDialogProps {
  open: boolean;
  title?: string;
  body: ReactNode;
  cancelLabel?: string;
  confirmLabel?: string;
  variant?: ConfirmVariant;
  disabled?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function ConfirmDialog({
  open,
  title,
  body,
  cancelLabel = "Cancel",
  confirmLabel = "Confirm",
  variant = "default",
  disabled = false,
  onCancel,
  onConfirm,
}: ConfirmDialogProps) {
  const confirmClass =
    variant === "destructive"
      ? "rounded-lg bg-[var(--accent-red)] px-4 py-2 text-sm font-medium text-white transition-all hover:opacity-85 disabled:opacity-40"
      : "rounded-lg bg-[var(--text-primary)] px-4 py-2 text-sm font-medium text-[var(--bg-primary)] transition-all hover:opacity-90 disabled:opacity-40";

  const width = title ? "w-80" : "w-72";
  const padding = title ? "p-6" : "p-5";

  return (
    <Modal
      open={open}
      onClose={onCancel}
      zIndexClassName="z-[60]"
      contentClassName={`${width} rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] ${padding} shadow-xl`}
    >
      {title && (
        <h3 className="text-base font-semibold text-[var(--text-primary)]">{title}</h3>
      )}
      <div
        className={`${title ? "mt-2" : ""} text-sm text-[var(--text-secondary)]`}
      >
        {body}
      </div>
      <div className={`${title ? "mt-5" : "mt-4"} flex justify-end gap-2`}>
        <button
          onClick={onCancel}
          className={`rounded-lg border border-[var(--border)] ${title ? "px-4 py-2 text-sm" : "px-3 py-1.5 text-xs"} font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)]`}
        >
          {cancelLabel}
        </button>
        <button
          onClick={onConfirm}
          disabled={disabled}
          className={
            variant === "destructive"
              ? confirmClass
              : title
                ? confirmClass
                : "rounded-lg bg-[var(--text-primary)] px-3 py-1.5 text-xs font-medium text-[var(--bg-primary)] hover:opacity-90 disabled:opacity-40"
          }
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

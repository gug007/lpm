import { useEffect, useState, type ReactNode } from "react";
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
  // A single string requires one typed confirmation; an array requires a
  // separate input matching each entry (e.g. one per project in a batch).
  confirmText?: string | string[];
  // Raise above a taller host modal (default sits above the standard z-50).
  zIndexClassName?: string;
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
  confirmText,
  zIndexClassName = "z-[60]",
  onCancel,
  onConfirm,
}: ConfirmDialogProps) {
  const required =
    confirmText == null ? [] : Array.isArray(confirmText) ? confirmText : [confirmText];
  const [typed, setTyped] = useState<string[]>([]);
  useEffect(() => setTyped(required.map(() => "")), [open, required.length]);

  const mustType = required.length > 0;
  const typedOk =
    !mustType || required.every((t, i) => (typed[i] ?? "").trim() === t);
  const confirmBlocked = disabled || !typedOk;
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
      zIndexClassName={zIndexClassName}
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
      {required.map((req, i) => (
        <div className="mt-4" key={`${req}-${i}`}>
          <label className="block text-[11px] text-[var(--text-muted)]">
            Type{" "}
            <span className="font-medium text-[var(--text-secondary)]">
              {req}
            </span>{" "}
            to confirm
          </label>
          <input
            autoFocus={i === 0}
            value={typed[i] ?? ""}
            onChange={(e) =>
              setTyped((prev) => {
                const next = [...prev];
                next[i] = e.target.value;
                return next;
              })
            }
            onKeyDown={(e) => {
              if (e.key === "Enter" && !confirmBlocked) {
                e.preventDefault();
                onConfirm();
              }
            }}
            placeholder={req}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            className="mt-1.5 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-cyan)]"
          />
        </div>
      ))}
      <div className={`${title ? "mt-5" : "mt-4"} flex justify-end gap-2`}>
        <button
          onClick={onCancel}
          className={`rounded-lg border border-[var(--border)] ${title ? "px-4 py-2 text-sm" : "px-3 py-1.5 text-xs"} font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)]`}
        >
          {cancelLabel}
        </button>
        <button
          onClick={onConfirm}
          disabled={confirmBlocked}
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

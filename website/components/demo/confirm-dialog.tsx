"use client";

import type { ReactNode } from "react";
import {
  DialogFooter,
  DialogHeader,
  DialogPanel,
  PrimaryButton,
  SecondaryButton,
} from "./ui-kit";
import { FOCUS_RING, PRESS } from "./ui";

export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  cancelLabel = "Cancel",
  danger = false,
  onCancel,
  onConfirm,
}: {
  title: string;
  body: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    // Anchored to the replica frame rather than the viewport — the demo is an
    // inset window, not a page-level overlay.
    <div className="absolute inset-0 z-[60] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close"
        onClick={onCancel}
        className="absolute inset-0 bg-black/50"
      />
      <DialogPanel className="relative max-w-80">
        <DialogHeader title={title} />
        <div className="mt-2 text-sm leading-relaxed text-[#b3b3b3]">{body}</div>
        <DialogFooter>
          <SecondaryButton onClick={onCancel}>{cancelLabel}</SecondaryButton>
          {danger ? (
            <button
              type="button"
              onClick={onConfirm}
              className={`rounded-lg bg-[#f87171] px-4 py-2 text-sm font-medium text-white hover:opacity-85 ${FOCUS_RING} ${PRESS}`}
            >
              {confirmLabel}
            </button>
          ) : (
            <PrimaryButton onClick={onConfirm}>{confirmLabel}</PrimaryButton>
          )}
        </DialogFooter>
      </DialogPanel>
    </div>
  );
}

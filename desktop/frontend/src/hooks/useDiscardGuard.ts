import { createElement, useEffect, useState } from "react";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";

interface DiscardGuardOptions {
  // The host modal's open flag — re-opening it dismisses a stale confirmation.
  open: boolean;
  // Names the thing being edited: "Your edits to this {entity} won't be saved."
  entity: string;
  // A getter, not a value: comparing drafts can be expensive, so it runs only
  // when a close is requested.
  isDirty: () => boolean;
  saving?: boolean;
  onClose: () => void;
}

export function useDiscardGuard({
  open,
  entity,
  isDirty,
  saving = false,
  onClose,
}: DiscardGuardOptions) {
  const [guardOpen, setGuardOpen] = useState(false);

  useEffect(() => {
    if (open) setGuardOpen(false);
  }, [open]);

  const requestClose = () => {
    if (saving) return;
    if (isDirty()) setGuardOpen(true);
    else onClose();
  };

  const dialog = createElement(ConfirmDialog, {
    open: guardOpen,
    title: "Discard changes?",
    body: `Your edits to this ${entity} won't be saved.`,
    confirmLabel: "Discard",
    cancelLabel: "Keep editing",
    variant: "destructive",
    onCancel: () => setGuardOpen(false),
    onConfirm: () => {
      setGuardOpen(false);
      onClose();
    },
  });

  return { requestClose, guardOpen, dialog };
}

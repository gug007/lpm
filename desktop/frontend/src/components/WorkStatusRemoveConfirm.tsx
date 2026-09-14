import { ConfirmDialog } from "./ui/ConfirmDialog";

interface WorkStatusRemoveConfirmProps {
  open: boolean;
  label: string;
  onCancel: () => void;
  onConfirm: () => void;
}

/** Asks before a status leaves the menu — from the menu's own × or the
 *  dialog's — and sits above the statuses dialog when that is what opened it. */
export function WorkStatusRemoveConfirm({ open, label, onCancel, onConfirm }: WorkStatusRemoveConfirmProps) {
  return (
    <ConfirmDialog
      open={open}
      title={`Remove ${label}?`}
      body="It leaves the Status menu. Projects wearing it keep it until you change them."
      confirmLabel="Remove"
      variant="destructive"
      zIndexClassName="z-[70]"
      onCancel={onCancel}
      onConfirm={onConfirm}
    />
  );
}

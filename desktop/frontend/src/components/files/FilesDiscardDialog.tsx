import { DISCARD_KEPT_TEXT } from "../../gitDiscardUndo";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import type { DiscardTarget } from "./useFileDiscard";

interface FilesDiscardDialogProps {
  target: DiscardTarget | null;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  zIndexClassName?: string;
}

export function FilesDiscardDialog({
  target,
  busy,
  onCancel,
  onConfirm,
  zIndexClassName,
}: FilesDiscardDialogProps) {
  const count = target?.paths.length ?? 0;
  return (
    <ConfirmDialog
      open={target !== null}
      title="Discard changes"
      variant="destructive"
      confirmLabel="Discard"
      disabled={busy}
      zIndexClassName={zIndexClassName}
      body={
        <span>
          {target?.isDir ? (
            <>
              Discard changes to {count} file{count !== 1 ? "s" : ""} in{" "}
              <span className="font-mono text-[var(--text-primary)]">{target.path}</span>?
            </>
          ) : (
            <>
              Discard changes to{" "}
              <span className="font-mono text-[var(--text-primary)]">{target?.path}</span>?
            </>
          )}{" "}
          {DISCARD_KEPT_TEXT}
        </span>
      }
      onCancel={onCancel}
      onConfirm={onConfirm}
    />
  );
}

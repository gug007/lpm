import { TrashIcon, XIcon } from "./icons";
import { ContextMenuItem } from "./ui/ContextMenuItem";
import { ContextMenuShell } from "./ui/ContextMenuShell";

interface SelectionContextMenuProps {
  x: number;
  y: number;
  count: number;
  busy: boolean;
  onDelete: () => void;
  onCancel: () => void;
  onClose: () => void;
}

export function SelectionContextMenu({
  x,
  y,
  count,
  busy,
  onDelete,
  onCancel,
  onClose,
}: SelectionContextMenuProps) {
  const close = (fn: () => void) => () => {
    fn();
    onClose();
  };

  return (
    <ContextMenuShell x={x} y={y} minWidth={180} onClose={onClose}>
      <div className="px-3 py-1.5 text-[11px] text-[var(--text-muted)]">
        {count} selected
      </div>
      <ContextMenuItem
        destructive
        label={`Delete ${count} selected`}
        icon={<TrashIcon />}
        onClick={close(onDelete)}
        disabled={count === 0 || busy}
      />
      <ContextMenuItem label="Cancel" icon={<XIcon />} onClick={close(onCancel)} />
    </ContextMenuShell>
  );
}

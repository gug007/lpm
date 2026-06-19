import { TrashIcon, XIcon } from "./icons";
import { ContextMenuItem } from "./ui/ContextMenuItem";
import { ContextMenuSeparator } from "./ui/ContextMenuSeparator";
import { ContextMenuShell } from "./ui/ContextMenuShell";
import { MoveToFolderSubmenu } from "./MoveToFolderSubmenu";
import type { ProjectGroup } from "../types";

interface SelectionContextMenuProps {
  x: number;
  y: number;
  count: number;
  busy: boolean;
  groups: ProjectGroup[];
  anyInGroup: boolean;
  onDelete: () => void;
  onMoveToGroup: (groupId: string | null) => void;
  onCreateGroupWith: () => void;
  onCancel: () => void;
  onClose: () => void;
}

export function SelectionContextMenu({
  x,
  y,
  count,
  busy,
  groups,
  anyInGroup,
  onDelete,
  onMoveToGroup,
  onCreateGroupWith,
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
      <MoveToFolderSubmenu
        groups={groups}
        showRemove={anyInGroup}
        disabled={count === 0 || busy}
        onMoveToGroup={onMoveToGroup}
        onCreateGroupWith={onCreateGroupWith}
        onClose={onClose}
      />
      <ContextMenuSeparator />
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

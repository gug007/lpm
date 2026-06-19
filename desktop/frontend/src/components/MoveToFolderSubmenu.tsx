import { FolderIcon } from "./icons";
import { ContextMenuItem } from "./ui/ContextMenuItem";
import { ContextMenuSeparator } from "./ui/ContextMenuSeparator";
import { ContextMenuSubmenu } from "./ui/ContextMenuSubmenu";
import type { ProjectGroup } from "../types";

interface MoveToFolderSubmenuProps {
  groups: ProjectGroup[];
  // The folder a target already lives in, disabled in the list (single project).
  disabledGroupId?: string | null;
  // Whether to offer "Remove from folder".
  showRemove: boolean;
  // Disable the whole submenu (e.g. nothing selected / busy).
  disabled?: boolean;
  onMoveToGroup: (groupId: string | null) => void;
  onCreateGroupWith: () => void;
  onClose: () => void;
}

export function MoveToFolderSubmenu({
  groups,
  disabledGroupId,
  showRemove,
  disabled,
  onMoveToGroup,
  onCreateGroupWith,
  onClose,
}: MoveToFolderSubmenuProps) {
  const close = (fn: () => void) => () => {
    fn();
    onClose();
  };
  return (
    <ContextMenuSubmenu label="Move to folder" icon={<FolderIcon />} disabled={disabled}>
      <ContextMenuItem label="New folder…" icon={<FolderIcon />} onClick={close(onCreateGroupWith)} />
      {(groups.length > 0 || showRemove) && <ContextMenuSeparator />}
      {groups.map((g) => (
        <ContextMenuItem
          key={g.id}
          label={g.name}
          disabled={disabledGroupId != null && g.id === disabledGroupId}
          onClick={close(() => onMoveToGroup(g.id))}
        />
      ))}
      {showRemove && (
        <ContextMenuItem label="Remove from folder" onClick={close(() => onMoveToGroup(null))} />
      )}
    </ContextMenuSubmenu>
  );
}

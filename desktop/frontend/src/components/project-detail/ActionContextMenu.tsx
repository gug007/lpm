import {
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  MoveIcon,
  PencilIcon,
  TrashIcon,
} from "../icons";
import { ContextMenuItem } from "../ui/ContextMenuItem";
import { ContextMenuSeparator } from "../ui/ContextMenuSeparator";
import { ContextMenuShell } from "../ui/ContextMenuShell";
import { ContextMenuSubmenu } from "../ui/ContextMenuSubmenu";
import type { ActionGroup } from "../actionsDndLayout";

interface ActionContextMenuProps {
  x: number;
  y: number;
  currentGroup: ActionGroup | null;
  canMoveLeft: boolean;
  canMoveRight: boolean;
  onMoveTo: (group: ActionGroup) => void;
  onMoveLeft: () => void;
  onMoveRight: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onClose: () => void;
}

export function ActionContextMenu({
  x,
  y,
  currentGroup,
  canMoveLeft,
  canMoveRight,
  onMoveTo,
  onMoveLeft,
  onMoveRight,
  onEdit,
  onDelete,
  onClose,
}: ActionContextMenuProps) {
  const close = (fn: () => void) => () => {
    fn();
    onClose();
  };
  return (
    <ContextMenuShell x={x} y={y} onClose={onClose}>
      <ContextMenuItem label="Edit action" icon={<PencilIcon />} onClick={close(onEdit)} />
      <ContextMenuSubmenu label="Move" icon={<MoveIcon />}>
        <ContextMenuItem
          label="To header"
          icon={<ChevronUpIcon />}
          disabled={currentGroup === "header"}
          onClick={close(() => onMoveTo("header"))}
        />
        <ContextMenuItem
          label="To footer"
          icon={<ChevronDownIcon />}
          disabled={currentGroup === "footer"}
          onClick={close(() => onMoveTo("footer"))}
        />
        <ContextMenuSeparator />
        <ContextMenuItem
          label="Left"
          icon={<ChevronLeftIcon />}
          disabled={!canMoveLeft}
          onClick={close(onMoveLeft)}
        />
        <ContextMenuItem
          label="Right"
          icon={<ChevronRightIcon />}
          disabled={!canMoveRight}
          onClick={close(onMoveRight)}
        />
      </ContextMenuSubmenu>
      <ContextMenuItem
        destructive
        label="Delete action"
        icon={<TrashIcon />}
        onClick={close(onDelete)}
      />
    </ContextMenuShell>
  );
}

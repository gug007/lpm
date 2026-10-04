import {
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  LayersIcon,
  MoveIcon,
  PanelBottomIcon,
  PanelTopIcon,
  PencilIcon,
  PlusIcon,
  TrashIcon,
} from "../icons";
import { ContextMenuItem } from "../ui/ContextMenuItem";
import { ContextMenuSeparator } from "../ui/ContextMenuSeparator";
import { ContextMenuShell } from "../ui/ContextMenuShell";
import { ContextMenuSubmenu } from "../ui/ContextMenuSubmenu";
import { type ZoneDisplay, type ZoneInfo, zoneDisplayOf } from "../../types";
import type { ActionGroup } from "../actionsDndLayout";

// A zone, or one layer of a zone, the button can move into.
export interface ZoneTarget {
  group: ActionGroup;
  label: string;
  row: ZoneDisplay;
}

interface ActionContextMenuProps {
  x: number;
  y: number;
  currentGroup: ActionGroup | null;
  canMoveLeft: boolean;
  canMoveRight: boolean;
  onMoveTo: (group: ActionGroup) => void;
  onMoveLeft: () => void;
  onMoveRight: () => void;
  // Set when the button sits in a zone. A full zone leaves almost none of its
  // frame to right-click, so its menu opens from here too.
  zone?: ZoneInfo;
  onZoneMenu: (zone: ZoneInfo) => void;
  // The zones and layers the button can move into, its own list left out.
  zoneTargets?: ZoneTarget[];
  // Set when the button can start a zone of its own; the item quotes its label.
  actionLabel?: string;
  onNewZone?: () => void;
  onEdit: () => void;
  canUngroup: boolean;
  onUngroup: () => void;
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
  zone,
  onZoneMenu,
  zoneTargets = [],
  actionLabel,
  onNewZone,
  onEdit,
  canUngroup,
  onUngroup,
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
        {(onNewZone || zoneTargets.length > 0) && <ContextMenuSeparator />}
        {onNewZone && (
          <ContextMenuItem label={`New zone with “${actionLabel}”`} icon={<PlusIcon />} onClick={close(onNewZone)} />
        )}
        {zoneTargets.map((target) => (
          <ContextMenuItem
            key={target.group}
            label={`Into “${target.label}”`}
            icon={target.row === "footer" ? <PanelBottomIcon /> : <PanelTopIcon />}
            onClick={close(() => onMoveTo(target.group))}
          />
        ))}
      </ContextMenuSubmenu>
      {zone && (
        <ContextMenuItem
          label={`Zone “${zone.label}”…`}
          icon={zoneDisplayOf(zone) === "footer" ? <PanelBottomIcon /> : <PanelTopIcon />}
          onClick={close(() => onZoneMenu(zone))}
        />
      )}
      {canUngroup && (
        <ContextMenuItem label="Ungroup" icon={<LayersIcon />} onClick={close(onUngroup)} />
      )}
      <ContextMenuItem
        destructive
        label="Delete action"
        icon={<TrashIcon />}
        onClick={close(onDelete)}
      />
    </ContextMenuShell>
  );
}

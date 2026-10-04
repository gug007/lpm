import type { MouseEvent } from "react";
import { useActionsDragActive } from "../ActionsDnd";
import { ActionsGroup } from "../ActionsGroup";
import { ActionsRowItem } from "../ActionsRowItem";
import { AddActionButton } from "../AddActionButton";
import { movedByZoneResize } from "../actionsDndLayout";
import type { RowItem } from "../../actionsLayoutModel";
import type { ActionInfo, ActionsLayout, ZoneInfo } from "../../types";
import { NO_DRAG_STYLE } from "./constants";

interface HeaderActionsProps {
  items: RowItem[];
  layout: ActionsLayout;
  wrapped: boolean;
  // Top-aligned once a zone can make the row taller than one button.
  alignTop: boolean;
  projectName: string;
  disabled: boolean;
  scope: string;
  onRun: (action: ActionInfo) => void;
  onContextMenu?: (e: MouseEvent, action: ActionInfo) => void;
  onZoneContextMenu?: (e: MouseEvent, zone: ZoneInfo) => void;
  onAddAction: () => void;
}

// The wrapper is the droppable group for cross-group drops from the footer.
export function HeaderActions({
  items,
  layout,
  wrapped,
  alignTop,
  projectName,
  disabled,
  scope,
  onRun,
  onContextMenu,
  onZoneContextMenu,
  onAddAction,
}: HeaderActionsProps) {
  const dragActive = useActionsDragActive();
  const align = alignTop ? "items-start" : "items-center";
  // A zone growing or shrinking mid-drag moves the items before it in this
  // right-anchored row, where dnd-kit would re-measure only those after it.
  // Listed rather than [] ("all"): dnd-kit merges the requests made at once,
  // and the zone's drop area, resizing with it, asks for itself alone.
  const movedByResize = movedByZoneResize(layout, "header");
  return (
    <ActionsGroup
      group="header"
      ids={layout.header}
      className={
        wrapped
          ? `flex flex-wrap ${align} justify-end gap-2`
          : dragActive
            ? `flex grow ${align} justify-end gap-2`
            : `flex shrink-0 ${align} gap-2`
      }
      style={NO_DRAG_STYLE}
    >
      {items.map((item) => (
        <ActionsRowItem
          key={item.id}
          item={item}
          display="header"
          movedByResize={movedByResize}
          projectName={projectName}
          disabled={disabled}
          scope={scope}
          onRun={onRun}
          onContextMenu={onContextMenu}
          onZoneContextMenu={onZoneContextMenu}
        />
      ))}
      <AddActionButton onAddAction={onAddAction} />
    </ActionsGroup>
  );
}

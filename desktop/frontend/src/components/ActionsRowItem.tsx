import type { MouseEvent } from "react";
import type { RowItem } from "../actionsLayoutModel";
import type { ActionInfo, ActionsLayout, ZoneDisplay, ZoneInfo } from "../types";
import { ActionsSortableItem } from "./ActionsSortableItem";
import { ActionView } from "./ActionView";
import { ZoneView } from "./ZoneView";

interface ActionsRowItemProps {
  item: RowItem;
  display: ZoneDisplay;
  layout: ActionsLayout;
  // What to re-measure when a zone in this row resizes mid-drag.
  movedByResize: string[];
  disabled: boolean;
  scope: string;
  onRun: (action: ActionInfo) => void;
  onContextMenu?: (e: MouseEvent, action: ActionInfo) => void;
  onZoneContextMenu?: (e: MouseEvent, zone: ZoneInfo) => void;
}

// One spot in the header or footer row: a zone with its buttons, or a button
// at its row's size.
export function ActionsRowItem({
  item,
  display,
  layout,
  movedByResize,
  disabled,
  scope,
  onRun,
  onContextMenu,
  onZoneContextMenu,
}: ActionsRowItemProps) {
  if (item.kind === "zone") {
    return (
      <ActionsSortableItem id={item.id} nestable={false} remeasureOnResize={movedByResize}>
        <ZoneView
          zone={item.zone}
          display={display}
          ids={layout.zones[item.zone.name] ?? []}
          actions={item.actions}
          disabled={disabled}
          scope={scope}
          onRun={onRun}
          onActionContextMenu={onContextMenu}
          onZoneContextMenu={onZoneContextMenu}
        />
      </ActionsSortableItem>
    );
  }
  return (
    <ActionsSortableItem id={item.id}>
      <ActionView
        action={item.action}
        size={display === "footer" ? "compact" : "default"}
        disabled={disabled}
        onRun={onRun}
        onContextMenu={onContextMenu}
        scope={scope}
      />
    </ActionsSortableItem>
  );
}

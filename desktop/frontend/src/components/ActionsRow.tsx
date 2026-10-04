import type { CSSProperties, MouseEvent, ReactNode } from "react";
import type { RowItem } from "../actionsLayoutModel";
import type { ActionInfo, ActionsLayout, ZoneDisplay, ZoneInfo } from "../types";
import { ActionsGroup } from "./ActionsGroup";
import { ActionsRowItem } from "./ActionsRowItem";
import { movedByZoneResize } from "./actionsDndLayout";

interface ActionsRowProps {
  display: ZoneDisplay;
  items: RowItem[];
  layout: ActionsLayout;
  projectName: string;
  disabled: boolean;
  onRun: (action: ActionInfo) => void;
  onContextMenu?: (e: MouseEvent, action: ActionInfo) => void;
  onZoneContextMenu?: (e: MouseEvent, zone: ZoneInfo) => void;
  className: string;
  style?: CSSProperties;
  // Controls that sit at the row's end but aren't items of the layout.
  children?: ReactNode;
}

// The header's or footer's drop group: its buttons and zones, then the trailing controls.
export function ActionsRow({
  display,
  items,
  layout,
  projectName,
  disabled,
  onRun,
  onContextMenu,
  onZoneContextMenu,
  className,
  style,
  children,
}: ActionsRowProps) {
  // A zone growing or shrinking mid-drag moves the items before it in this
  // right-anchored row, where dnd-kit would re-measure only those after it.
  // Listed rather than [] ("all"): dnd-kit merges the requests made at once,
  // and the zone's drop area, resizing with it, asks for itself alone.
  const movedByResize = movedByZoneResize(layout, display);
  return (
    <ActionsGroup group={display} ids={layout[display]} className={className} style={style}>
      {items.map((item) => (
        <ActionsRowItem
          key={item.id}
          item={item}
          display={display}
          movedByResize={movedByResize}
          projectName={projectName}
          disabled={disabled}
          onRun={onRun}
          onContextMenu={onContextMenu}
          onZoneContextMenu={onZoneContextMenu}
        />
      ))}
      {children}
    </ActionsGroup>
  );
}

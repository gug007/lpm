import type { MouseEvent, ReactNode } from "react";
import type { RowItem } from "../actionsLayoutModel";
import type { ActionInfo, ActionsLayout, ZoneInfo } from "../types";
import { ActionsGroup } from "./ActionsGroup";
import { ActionsRowItem } from "./ActionsRowItem";
import { movedByZoneResize } from "./actionsDndLayout";

interface FooterActionsProps {
  items: RowItem[];
  layout: ActionsLayout;
  // Top-aligned once a zone can make the row taller than one button.
  alignTop: boolean;
  projectName: string;
  disabled: boolean;
  scope: string;
  onRun: (action: ActionInfo) => void;
  onContextMenu?: (e: MouseEvent, action: ActionInfo) => void;
  onZoneContextMenu?: (e: MouseEvent, zone: ZoneInfo) => void;
  // Controls that sit at the row's end but aren't items of the layout.
  children?: ReactNode;
}

// The footer's drop group: its buttons and zones, then the trailing controls.
export function FooterActions({
  items,
  layout,
  alignTop,
  projectName,
  disabled,
  scope,
  onRun,
  onContextMenu,
  onZoneContextMenu,
  children,
}: FooterActionsProps) {
  // The footer is right-anchored like the header: a zone resizing mid-drag
  // moves the items before it, where dnd-kit would re-measure only those after.
  const movedByResize = movedByZoneResize(layout, "footer");
  return (
    <ActionsGroup
      group="footer"
      ids={layout.footer}
      className={`flex flex-wrap ${alignTop ? "items-start" : "items-center"} justify-end gap-1`}
    >
      {items.map((item) => (
        <ActionsRowItem
          key={item.id}
          item={item}
          display="footer"
          movedByResize={movedByResize}
          projectName={projectName}
          disabled={disabled}
          scope={scope}
          onRun={onRun}
          onContextMenu={onContextMenu}
          onZoneContextMenu={onZoneContextMenu}
        />
      ))}
      {children}
    </ActionsGroup>
  );
}

import type { MouseEvent } from "react";
import { useActionsDragActive } from "../ActionsDnd";
import { ActionsRow } from "../ActionsRow";
import { AddActionButton } from "../AddActionButton";
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
  onRun: (action: ActionInfo) => void;
  onContextMenu?: (e: MouseEvent, action: ActionInfo) => void;
  onZoneContextMenu?: (e: MouseEvent, zone: ZoneInfo) => void;
  onAddAction: () => void;
}

// The wrapper is the droppable group for cross-group drops from the footer.
export function HeaderActions({ wrapped, alignTop, onAddAction, ...row }: HeaderActionsProps) {
  const dragActive = useActionsDragActive();
  const align = alignTop ? "items-start" : "items-center";
  return (
    <ActionsRow
      {...row}
      display="header"
      className={
        wrapped
          ? `flex flex-wrap ${align} justify-end gap-2`
          : dragActive
            ? `flex grow ${align} justify-end gap-2`
            : `flex shrink-0 ${align} gap-2`
      }
      style={NO_DRAG_STYLE}
    >
      <AddActionButton onAddAction={onAddAction} />
    </ActionsRow>
  );
}

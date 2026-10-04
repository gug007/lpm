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

// While dragging, the header only re-measures on drop, so a button brought in
// from the footer wraps the inline row in place instead of pushing it over the
// project name. Inline, so it beats the title row's shrink-0 for its children.
const INLINE_DRAG_STYLE = { ...NO_DRAG_STYLE, flexShrink: 1, minWidth: 0 } as const;

// The wrapper is the droppable group for cross-group drops from the footer.
export function HeaderActions({ wrapped, alignTop, onAddAction, ...row }: HeaderActionsProps) {
  const dragActive = useActionsDragActive();
  const align = alignTop ? "items-start" : "items-center";
  const inlineDrag = !wrapped && dragActive;
  return (
    <ActionsRow
      {...row}
      display="header"
      className={
        wrapped
          ? `flex flex-wrap ${align} justify-end gap-2`
          : inlineDrag
            ? `flex grow flex-wrap ${align} justify-end gap-2`
            : `flex shrink-0 ${align} gap-2`
      }
      style={inlineDrag ? INLINE_DRAG_STYLE : NO_DRAG_STYLE}
    >
      <AddActionButton onAddAction={onAddAction} />
    </ActionsRow>
  );
}

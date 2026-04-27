import { ActionsGroup } from "../ActionsDnd";
import { ActionView } from "../ActionView";
import { SortableItem } from "../ui/SortableList";
import type { ActionInfo } from "../../types";
import { NO_DRAG_STYLE } from "./constants";

interface HeaderActionsProps {
  actions: ActionInfo[];
  ids: string[];
  wrapped: boolean;
  disabled: boolean;
  onRun: (action: ActionInfo) => void;
}

// The drag-sortable list of header-display actions. The wrapper is also
// the droppable zone for cross-group drops from the footer.
export function HeaderActions({ actions, ids, wrapped, disabled, onRun }: HeaderActionsProps) {
  return (
    <ActionsGroup
      group="header"
      ids={ids}
      className={
        wrapped
          ? "flex flex-wrap items-center justify-end gap-2"
          : "flex shrink-0 items-center gap-2"
      }
      style={NO_DRAG_STYLE}
    >
      {actions.map((action) => (
        <SortableItem key={action.name} id={action.name}>
          <ActionView action={action} compact={false} disabled={disabled} onRun={onRun} />
        </SortableItem>
      ))}
    </ActionsGroup>
  );
}

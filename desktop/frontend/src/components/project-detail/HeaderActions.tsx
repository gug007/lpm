import { ActionsGroup } from "../ActionsDnd";
import { ActionView } from "../ActionView";
import { PlusIcon } from "../icons";
import { SortableItem } from "../ui/SortableList";
import { Tooltip } from "../ui/Tooltip";
import type { ActionInfo } from "../../types";
import { NO_DRAG_STYLE } from "./constants";

interface HeaderActionsProps {
  actions: ActionInfo[];
  ids: string[];
  wrapped: boolean;
  disabled: boolean;
  onRun: (action: ActionInfo) => void;
  onAddAction: () => void;
}

// The drag-sortable list of header-display actions. The wrapper is also
// the droppable zone for cross-group drops from the footer.
export function HeaderActions({
  actions,
  ids,
  wrapped,
  disabled,
  onRun,
  onAddAction,
}: HeaderActionsProps) {
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
      <Tooltip content="Create action" side="bottom">
        <button
          type="button"
          onClick={onAddAction}
          aria-label="Create action"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-dashed border-[var(--border)] text-[var(--text-muted)] transition-colors hover:border-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
        >
          <PlusIcon />
        </button>
      </Tooltip>
    </ActionsGroup>
  );
}

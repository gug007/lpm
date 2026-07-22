import type { MouseEvent } from "react";
import { ActionsGroup, useActionsDragActive } from "../ActionsDnd";
import { ActionView } from "../ActionView";
import { PlusIcon } from "../icons";
import { ActionsSortableItem } from "../ActionsSortableItem";
import { Tooltip } from "../ui/Tooltip";
import type { ActionInfo } from "../../types";
import { NO_DRAG_STYLE } from "./constants";

interface HeaderActionsProps {
  actions: ActionInfo[];
  ids: string[];
  wrapped: boolean;
  disabled: boolean;
  scope: string;
  onRun: (action: ActionInfo) => void;
  onContextMenu?: (e: MouseEvent, action: ActionInfo) => void;
  onAddAction: () => void;
}

// The wrapper is the droppable zone for cross-group drops from the footer.
export function HeaderActions({
  actions,
  ids,
  wrapped,
  disabled,
  scope,
  onRun,
  onContextMenu,
  onAddAction,
}: HeaderActionsProps) {
  const dragActive = useActionsDragActive();
  return (
    <ActionsGroup
      group="header"
      ids={ids}
      className={
        wrapped
          ? "flex flex-wrap items-center justify-end gap-2"
          : dragActive
            ? "flex grow items-center justify-end gap-2"
            : "flex shrink-0 items-center gap-2"
      }
      style={NO_DRAG_STYLE}
    >
      {actions.map((action) => (
        <ActionsSortableItem key={action.name} id={action.name}>
          <ActionView
            action={action}
            compact={false}
            disabled={disabled}
            onRun={onRun}
            onContextMenu={onContextMenu}
            scope={scope}
          />
        </ActionsSortableItem>
      ))}
      <Tooltip
        content={
          <span className="flex flex-col gap-0.5">
            <span className="font-medium text-[var(--text-primary)]">Create action</span>
            <span className="text-[var(--text-secondary)]">
              One-click shortcuts for the commands you run all the time — tests, builds, deploys, migrations, log tails, or anything else. Drag actions to rearrange them between the header and the footer, or right-click one for more options.
            </span>
          </span>
        }
        side="bottom"
        wide
      >
        <button
          type="button"
          onClick={onAddAction}
          aria-label="Create action"
          className="flex h-7 shrink-0 items-center gap-1 rounded-lg border border-dashed border-[var(--border)] px-2 text-xs text-[var(--text-muted)] transition-colors hover:border-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
        >
          <PlusIcon />
          <span>Action</span>
        </button>
      </Tooltip>
    </ActionsGroup>
  );
}

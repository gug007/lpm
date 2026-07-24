import type { MouseEvent } from "react";
import { ActionsGroup, useActionsDragActive } from "../ActionsDnd";
import { ActionView } from "../ActionView";
import { GripVerticalIcon, MousePointerClickIcon, PlusIcon } from "../icons";
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
          <span className="flex flex-col">
            <span className="flex items-center gap-2">
              <span className="magic-ring h-[22px] w-[22px] shrink-0 rounded-md p-[1px]">
                <span className="flex h-full w-full items-center justify-center rounded-[5px] bg-[var(--bg-secondary)] text-[color-mix(in_srgb,#a855f7_60%,var(--text-muted))]">
                  <PlusIcon />
                </span>
              </span>
              <span className="font-semibold text-[var(--text-primary)]">Create action</span>
            </span>
            <span className="mt-1.5 text-[var(--text-secondary)]">
              One-click shortcuts for the commands you run all the time — tests, builds, deploys, log tails, or anything else.
            </span>
            <span className="mt-2.5 flex flex-col gap-1.5 border-t border-[var(--border)] pt-2.5 text-[var(--text-muted)]">
              <span className="flex items-center gap-2">
                <GripVerticalIcon size={13} />
                <span>Drag to arrange in the header or footer</span>
              </span>
              <span className="flex items-center gap-2">
                <MousePointerClickIcon size={13} />
                <span>Right-click an action for more options</span>
              </span>
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
          className="magic-ring group shrink-0 rounded-lg p-[1px] transition-all duration-150 active:scale-[0.97]"
        >
          <span className="flex items-center gap-1 rounded-[calc(0.5rem-1px)] bg-[var(--bg-primary)] px-2.5 py-1.5 text-xs font-medium transition-colors duration-150 group-hover:bg-[color-mix(in_srgb,#a855f7_5%,var(--bg-primary))]">
            <span className="text-[color-mix(in_srgb,#a855f7_60%,var(--text-muted))]">
              <PlusIcon />
            </span>
            <span className="text-[var(--text-secondary)] transition-colors duration-150 group-hover:text-[var(--text-primary)]">Action</span>
          </span>
        </button>
      </Tooltip>
    </ActionsGroup>
  );
}

import type { MouseEvent } from "react";
import { useGitStatus } from "../hooks/useGitStatus";
import { ActionsGroup, useActionsDragActive } from "./ActionsDnd";
import { ActionView } from "./ActionView";
import { BranchSwitcher } from "./BranchSwitcher";
import { ActionsSortableItem } from "./ActionsSortableItem";
import type { ActionInfo } from "../types";

interface TerminalFooterProps {
  projectName: string;
  projectPath: string;
  actions: ActionInfo[];
  actionIds: string[];
  onRunAction: (action: ActionInfo) => void;
  onActionContextMenu?: (e: MouseEvent, action: ActionInfo) => void;
  disabled: boolean;
}

export function TerminalFooter({
  projectName,
  projectPath,
  actions,
  actionIds,
  onRunAction,
  onActionContextMenu,
  disabled,
}: TerminalFooterProps) {
  const gitState = useGitStatus(projectPath);
  const isGitRepo = !!gitState.status?.isGitRepo;
  const dragging = useActionsDragActive();
  const emptyBar = !isGitRepo && actions.length === 0;

  // Without this an empty footer can never receive a drop; floating
  // the drag-only bar avoids resizing the terminal (pty SIGWINCH)
  // twice per drag.
  if (!dragging && emptyBar) return null;
  const floating = dragging && emptyBar;

  return (
    <ActionsGroup
      group="footer"
      ids={actionIds}
      className={`flex shrink-0 items-center justify-end gap-1 bg-[var(--terminal-bg)] px-2 py-1${floating ? " absolute inset-x-0 bottom-0 z-30" : ""}`}
    >
      {actions.map((action) => (
        <ActionsSortableItem key={action.name} id={action.name}>
          <ActionView
            action={action}
            compact
            disabled={disabled}
            onRun={onRunAction}
            onContextMenu={onActionContextMenu}
          />
        </ActionsSortableItem>
      ))}
      {isGitRepo && <BranchSwitcher projectName={projectName} projectPath={projectPath} gitState={gitState} />}
    </ActionsGroup>
  );
}

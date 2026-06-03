import type { MouseEvent } from "react";
import { useGitStatus } from "../hooks/useGitStatus";
import { ActionsGroup } from "./ActionsDnd";
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

  if (!isGitRepo && actions.length === 0) return null;

  return (
    <ActionsGroup
      group="footer"
      ids={actionIds}
      className="flex shrink-0 items-center justify-end gap-1 bg-[var(--terminal-bg)] px-2 py-1"
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

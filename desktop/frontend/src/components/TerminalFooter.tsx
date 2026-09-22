import type { MouseEvent } from "react";
import { useGitStatus } from "../hooks/useGitStatus";
import { useBranchPullRequest } from "../hooks/useBranchPullRequest";
import { BranchPrLink } from "./BranchPrLink";
import { ActionsGroup } from "./ActionsDnd";
import { ActionView } from "./ActionView";
import { BranchSwitcher } from "./BranchSwitcher";
import { ActionsSortableItem } from "./ActionsSortableItem";
import { AppTip } from "./AppTip";
import type { ActionInfo } from "../types";

interface TerminalFooterProps {
  projectName: string;
  projectPath: string;
  actions: ActionInfo[];
  actionIds: string[];
  onRunAction: (action: ActionInfo) => void;
  onActionContextMenu?: (e: MouseEvent, action: ActionInfo) => void;
  disabled: boolean;
  // Off screen (another project or detail view in front): the PR lookup pauses.
  active?: boolean;
}

export function TerminalFooter({
  projectName,
  projectPath,
  actions,
  actionIds,
  onRunAction,
  onActionContextMenu,
  disabled,
  active = true,
}: TerminalFooterProps) {
  const gitState = useGitStatus(projectPath);
  const isGitRepo = !!gitState.status?.isGitRepo;
  const branch = gitState.status?.detached ? "" : (gitState.status?.branch ?? "");
  const pullRequest = useBranchPullRequest(projectPath, branch, active && isGitRepo);

  return (
    <div className="composer-terminal-surface flex items-center gap-2 bg-[var(--terminal-bg)] px-3 py-2">
      <AppTip />
      <ActionsGroup
        group="footer"
        ids={actionIds}
        className="flex flex-wrap items-center justify-end gap-1"
      >
        {actions.map((action) => (
          <ActionsSortableItem key={action.name} id={action.name}>
            <ActionView
              action={action}
              compact
              disabled={disabled}
              onRun={onRunAction}
              onContextMenu={onActionContextMenu}
              scope={projectName}
            />
          </ActionsSortableItem>
        ))}
        {pullRequest && <BranchPrLink pr={pullRequest} />}
        {isGitRepo && (
          <BranchSwitcher
            projectName={projectName}
            projectPath={projectPath}
            gitState={gitState}
            pullRequest={pullRequest}
          />
        )}
      </ActionsGroup>
    </div>
  );
}

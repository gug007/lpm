import { useGitStatus } from "../hooks/useGitStatus";
import { ActionsGroup } from "./ActionsDnd";
import { ActionView } from "./ActionView";
import { BranchSwitcher } from "./BranchSwitcher";
import { SortableItem } from "./ui/SortableList";
import type { ActionInfo } from "../types";

interface TerminalFooterProps {
  projectPath: string;
  actions: ActionInfo[];
  actionIds: string[];
  onRunAction: (action: ActionInfo) => void;
  disabled: boolean;
}

export function TerminalFooter({ projectPath, actions, actionIds, onRunAction, disabled }: TerminalFooterProps) {
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
        <SortableItem key={action.name} id={action.name}>
          <ActionView action={action} compact disabled={disabled} onRun={onRunAction} />
        </SortableItem>
      ))}
      {isGitRepo && <BranchSwitcher projectPath={projectPath} gitState={gitState} />}
    </ActionsGroup>
  );
}

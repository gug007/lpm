import { useGitStatus } from "../hooks/useGitStatus";
import { BranchSwitcher } from "./BranchSwitcher";
import { SplitButton } from "./SplitButton";
import type { ActionInfo } from "../types";

interface TerminalFooterProps {
  projectPath: string;
  actions: ActionInfo[];
  onRunAction: (action: ActionInfo) => void;
  disabled: boolean;
}

export function TerminalFooter({ projectPath, actions, onRunAction, disabled }: TerminalFooterProps) {
  const gitState = useGitStatus(projectPath);
  const isGitRepo = !!gitState.status?.isGitRepo;

  if (!isGitRepo && actions.length === 0) return null;

  return (
    <div className="flex shrink-0 items-center justify-end gap-1.5 border-x border-t border-[var(--border)] bg-[var(--terminal-header)] px-3 py-1.5">
      {actions.map((action) =>
        action.children?.length ? (
          <SplitButton
            key={action.name}
            action={action}
            disabled={disabled}
            onRunAction={onRunAction}
            compact
          />
        ) : (
          <button
            key={action.name}
            onClick={() => onRunAction(action)}
            disabled={disabled}
            title={action.label}
            className="flex items-center rounded-md border border-[var(--border)] bg-[var(--bg-primary)] px-2.5 py-1 text-[11px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-50"
          >
            {action.label}
          </button>
        ),
      )}
      {isGitRepo && <BranchSwitcher projectPath={projectPath} gitState={gitState} />}
    </div>
  );
}

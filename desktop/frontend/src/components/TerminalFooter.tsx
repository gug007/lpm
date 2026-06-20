import type { MouseEvent } from "react";
import { useGitStatus } from "../hooks/useGitStatus";
import { ActionsGroup } from "./ActionsDnd";
import { ActionView } from "./ActionView";
import { BranchSwitcher } from "./BranchSwitcher";
import { ActionsSortableItem } from "./ActionsSortableItem";
import { KeyboardIcon } from "./icons";
import { Tooltip } from "./ui/Tooltip";
import { useComposerStore } from "../store/composer";
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
  // The keyboard's open/close state is shared across all terminals; the toggle
  // is only enabled when this project has a terminal to send to.
  const activeTerminalId = useComposerStore((s) => s.active[projectName] ?? null);
  const composerOpen = useComposerStore((s) => s.open);

  return (
    <div className="flex items-center gap-1 bg-[var(--terminal-bg)] px-2 py-1">
      <Tooltip
        content={
          <>
            Terminal input <span className="ml-1 opacity-70">⌘I</span>
          </>
        }
        side="top"
        align="start"
      >
        <button
          type="button"
          onClick={() => activeTerminalId && useComposerStore.getState().toggle()}
          disabled={!activeTerminalId}
          aria-label="Toggle terminal input"
          aria-pressed={composerOpen}
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-colors ${
            !activeTerminalId
              ? "text-[var(--text-muted)] opacity-40"
              : composerOpen
                ? "bg-[var(--bg-hover)] text-[var(--text-primary)]"
                : "text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
          }`}
        >
          <KeyboardIcon />
        </button>
      </Tooltip>
      <ActionsGroup
        group="footer"
        ids={actionIds}
        className="flex flex-1 flex-wrap items-center justify-end gap-1"
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
    </div>
  );
}

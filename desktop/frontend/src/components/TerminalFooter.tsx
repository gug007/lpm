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
  // The keyboard toggle is shown only when a terminal is active — service and
  // browser tabs have no input to send to. `active` is null for those tabs.
  const activeTerminalId = useComposerStore((s) => s.active[projectName] ?? null);
  const composerOpen = useComposerStore((s) => s.open);

  return (
    <div className="flex items-center gap-1 bg-[var(--terminal-bg)] px-2 py-1">
      {activeTerminalId && (
        <Tooltip
          content={
            <span className="flex items-center gap-2">
              <span className="font-medium">Terminal input</span>
              <span className="rounded-full border border-[var(--accent-blue)]/30 bg-[var(--accent-blue)]/15 px-1.5 py-px text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--accent-blue)]">
                Beta
              </span>
              <kbd className="flex h-[18px] items-center rounded-md border border-[var(--border)] bg-[var(--bg-active)] px-1.5 font-mono text-[10px] leading-none text-[var(--text-secondary)]">
                ⌘I
              </kbd>
            </span>
          }
          side="top"
          align="start"
        >
          <button
            type="button"
            onClick={() => useComposerStore.getState().toggle()}
            aria-label="Toggle terminal input"
            aria-pressed={composerOpen}
            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-colors ${
              composerOpen
                ? "bg-[var(--bg-hover)] text-[var(--text-primary)]"
                : "text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
            }`}
          >
            <KeyboardIcon />
          </button>
        </Tooltip>
      )}
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

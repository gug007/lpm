import type { MouseEvent } from "react";
import { useGitStatus } from "../hooks/useGitStatus";
import { useBranchPullRequest } from "../hooks/useBranchPullRequest";
import { BranchPrLink } from "./BranchPrLink";
import { BranchSwitcher } from "./BranchSwitcher";
import { AppTip } from "./AppTip";
import { FooterActions } from "./FooterActions";
import { FOOTER_ROW_PX } from "./zoneGeometry";
import type { RowItem } from "../actionsLayoutModel";
import type { ActionInfo, ActionsLayout, ZoneInfo } from "../types";

interface TerminalFooterProps {
  projectName: string;
  projectPath: string;
  items: RowItem[];
  layout: ActionsLayout;
  onRunAction: (action: ActionInfo) => void;
  onActionContextMenu?: (e: MouseEvent, action: ActionInfo) => void;
  onZoneContextMenu?: (e: MouseEvent, zone: ZoneInfo) => void;
  onRowContextMenu?: (e: MouseEvent<HTMLDivElement>) => void;
  disabled: boolean;
  // Off screen (another project or detail view in front): the PR lookup pauses.
  active?: boolean;
}

export function TerminalFooter({
  projectName,
  projectPath,
  items,
  layout,
  onRunAction,
  onActionContextMenu,
  onZoneContextMenu,
  onRowContextMenu,
  disabled,
  active = true,
}: TerminalFooterProps) {
  const gitState = useGitStatus(projectPath);
  const isGitRepo = !!gitState.status?.isGitRepo;
  const branch = gitState.status?.detached ? "" : (gitState.status?.branch ?? "");
  const pullRequest = useBranchPullRequest(projectPath, branch, active && isGitRepo);
  // A zone can make the row taller than one button; everything then lines up
  // with the first row, the tip included.
  const alignTop = items.some((item) => item.kind === "zone");

  return (
    <div
      onContextMenu={onRowContextMenu}
      className={`composer-terminal-surface flex ${alignTop ? "items-start" : "items-center"} gap-2 bg-[var(--terminal-bg)] px-3 py-2`}
    >
      <AppTip rowHeight={alignTop ? FOOTER_ROW_PX : undefined} />
      <FooterActions
        items={items}
        layout={layout}
        alignTop={alignTop}
        disabled={disabled}
        scope={projectName}
        onRun={onRunAction}
        onContextMenu={onActionContextMenu}
        onZoneContextMenu={onZoneContextMenu}
      >
        {pullRequest && <BranchPrLink pr={pullRequest} />}
        {isGitRepo && (
          <BranchSwitcher
            projectName={projectName}
            projectPath={projectPath}
            gitState={gitState}
            pullRequest={pullRequest}
          />
        )}
      </FooterActions>
    </div>
  );
}

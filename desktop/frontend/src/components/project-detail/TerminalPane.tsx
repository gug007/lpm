import { type CSSProperties, type MouseEvent, type RefObject } from "react";
import { TerminalView, type TerminalViewHandle } from "../TerminalView";
import { TerminalFooter } from "../TerminalFooter";
import type { PaneStatus } from "../../hooks/usePaneStatus";
import type { TerminalThemeName } from "../../terminal-themes";
import type { ActionInfo, ServiceInfo } from "../../types";

interface TerminalPaneProps {
  // active = the terminal tab is the visible detail view (hides when
  // the user switches to config/notes). visible = the project itself
  // is the foreground project. TerminalView gets the conjunction so it
  // can pause work when off-screen for either reason.
  active: boolean;
  visible: boolean;
  themeStyle: CSSProperties | undefined;
  terminalRef: RefObject<TerminalViewHandle | null>;
  projectName: string;
  projectRoot: string;
  services: ServiceInfo[];
  terminalTheme: TerminalThemeName;
  fontSize: number;
  paneStatus: PaneStatus;
  footerActions: ActionInfo[];
  footerIds: string[];
  disabled: boolean;
  onTerminalCountChange: (n: number) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onRunAction: (action: ActionInfo) => void;
  onActionContextMenu?: (e: MouseEvent, action: ActionInfo) => void;
}

export function TerminalPane({
  active,
  visible,
  themeStyle,
  terminalRef,
  projectName,
  projectRoot,
  services,
  terminalTheme,
  fontSize,
  paneStatus,
  footerActions,
  footerIds,
  disabled,
  onTerminalCountChange,
  onZoomIn,
  onZoomOut,
  onRunAction,
  onActionContextMenu,
}: TerminalPaneProps) {
  return (
    <div
      className={active ? "relative mt-1.5 -mx-6 -mb-6 flex min-h-0 flex-1 flex-col overflow-hidden" : "hidden"}
      style={themeStyle}
    >
      <TerminalView
        ref={terminalRef}
        projectName={projectName}
        services={services}
        terminalTheme={terminalTheme}
        onTerminalCountChange={onTerminalCountChange}
        fontSize={fontSize}
        onZoomIn={onZoomIn}
        onZoomOut={onZoomOut}
        runningPaneIDs={paneStatus.running}
        donePaneIDs={paneStatus.done}
        waitingPaneIDs={paneStatus.waiting}
        errorPaneIDs={paneStatus.error}
        visible={visible && active}
      />
      <TerminalFooter
        projectPath={projectRoot}
        actions={footerActions}
        actionIds={footerIds}
        onRunAction={onRunAction}
        onActionContextMenu={onActionContextMenu}
        disabled={disabled}
      />
    </div>
  );
}

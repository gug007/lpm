import { type CSSProperties, type MouseEvent, type RefObject } from "react";
import { TerminalView, type TerminalViewHandle } from "../TerminalView";
import { TerminalFooter } from "../TerminalFooter";
import { EmptyTerminalState } from "./EmptyTerminalState";
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
  // showEmptyState keeps TerminalView mounted (so terminalRef stays
  // alive for ⌘T) while swapping the empty-state placeholder in front
  // of it — the footer stays put below either one.
  showEmptyState: boolean;
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
  onNewTerminal: () => void;
  onEditConfig: () => void;
  onResumeSession?: () => void;
}

export function TerminalPane({
  active,
  visible,
  showEmptyState,
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
  onNewTerminal,
  onEditConfig,
  onResumeSession,
}: TerminalPaneProps) {
  return (
    <div
      className={active ? "relative mt-1.5 -ml-[calc(1.5rem+1px)] -mr-[calc(1.5rem+1px)] -mb-[calc(1.5rem+1px)] flex min-h-0 flex-1 flex-col overflow-hidden" : "hidden"}
      style={themeStyle}
    >
      <div className={showEmptyState ? "hidden" : "contents"}>
        <TerminalView
          ref={terminalRef}
          projectName={projectName}
          projectRoot={projectRoot}
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
          visible={visible && active && !showEmptyState}
          onResumeSession={onResumeSession}
        />
      </div>
      {showEmptyState && (
        <EmptyTerminalState
          projectName={projectName}
          onNewTerminal={onNewTerminal}
          onEditConfig={onEditConfig}
        />
      )}
      <TerminalFooter
        projectName={projectName}
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

import { type CSSProperties, type MouseEvent, type RefObject } from "react";
import { TerminalView, type TerminalViewHandle } from "../TerminalView";
import { TerminalFooter } from "../TerminalFooter";
import { EmptyTerminalState } from "./EmptyTerminalState";
import type { PaneStatus } from "../../hooks/usePaneStatus";
import type { TerminalThemeName } from "../../terminal-themes";
import type { RowItem } from "../../actionsLayoutModel";
import type { ActionInfo, ActionsLayout, ServiceInfo, ZoneInfo } from "../../types";

interface TerminalPaneProps {
  // active = the terminal tab is the visible detail view (hides when
  // the user switches to config/notes). visible = the project itself
  // is the foreground project. TerminalView gets the conjunction so it
  // can pause work when off-screen for either reason.
  active: boolean;
  visible: boolean;
  // False for a side-by-side column the user isn't working in.
  keysActive: boolean;
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
  footerItems: RowItem[];
  layout: ActionsLayout;
  disabled: boolean;
  onTerminalCountChange: (n: number) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onRunAction: (action: ActionInfo) => void;
  onActionContextMenu?: (e: MouseEvent, action: ActionInfo) => void;
  onZoneContextMenu?: (e: MouseEvent, zone: ZoneInfo) => void;
  onFooterContextMenu?: (e: MouseEvent<HTMLDivElement>) => void;
  onNewTerminal: () => void;
  onEditConfig: () => void;
  onResumeSession?: () => void;
}

export function TerminalPane({
  active,
  visible,
  keysActive,
  showEmptyState,
  themeStyle,
  terminalRef,
  projectName,
  projectRoot,
  services,
  terminalTheme,
  fontSize,
  paneStatus,
  footerItems,
  layout,
  disabled,
  onTerminalCountChange,
  onZoomIn,
  onZoomOut,
  onRunAction,
  onActionContextMenu,
  onZoneContextMenu,
  onFooterContextMenu,
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
          paneStatus={paneStatus}
          visible={visible && active && !showEmptyState}
          keysActive={keysActive}
          onResumeSession={onResumeSession}
        />
      </div>
      {showEmptyState && (
        <EmptyTerminalState
          projectName={projectName}
          onNewTerminal={onNewTerminal}
          onEditConfig={onEditConfig}
          onResumeSession={onResumeSession}
        />
      )}
      <TerminalFooter
        active={active && visible}
        projectName={projectName}
        projectPath={projectRoot}
        items={footerItems}
        layout={layout}
        onRunAction={onRunAction}
        onActionContextMenu={onActionContextMenu}
        onZoneContextMenu={onZoneContextMenu}
        onRowContextMenu={onFooterContextMenu}
        disabled={disabled}
      />
    </div>
  );
}

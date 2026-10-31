import { type CSSProperties, type MouseEvent, type RefObject } from "react";
import { TerminalView, type TerminalViewHandle } from "../TerminalView";
import { TerminalFooter } from "../TerminalFooter";
import { EmptyTerminalState } from "./EmptyTerminalState";
import type { PaneStatus } from "../../hooks/usePaneStatus";
import type { RunActionOpts } from "../../hooks/useProjectActions";
import type { SessionRow } from "../../agentSessions";
import type { PersistedHistoryEntry } from "../../terminals";
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
  // The name the user sees for the project (its label), for copy only.
  projectLabel: string;
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
  onRunAction: (action: ActionInfo, opts?: RunActionOpts) => void;
  onActionContextMenu?: (e: MouseEvent, action: ActionInfo) => void;
  onZoneContextMenu?: (e: MouseEvent, zone: ZoneInfo) => void;
  onFooterContextMenu?: (e: MouseEvent<HTMLDivElement>) => void;
  onNewTerminal: () => void;
  onEditService: (serviceName: string) => void;
  onResumeSession?: () => void;
  // The empty state's recent conversations, and how one of them resumes.
  sessionHistory: PersistedHistoryEntry[];
  hiddenSessions: ReadonlySet<string>;
  onResumeRow: (row: SessionRow) => void;
  actions?: ActionInfo[];
  // ⌘T asked the empty state for the "Pick agent and model on +" popup.
  newTabAsked: boolean;
  onNewTabHandled: () => void;
}

export function TerminalPane({
  active,
  visible,
  keysActive,
  showEmptyState,
  themeStyle,
  terminalRef,
  projectName,
  projectLabel,
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
  onEditService,
  onResumeSession,
  sessionHistory,
  hiddenSessions,
  onResumeRow,
  actions,
  newTabAsked,
  onNewTabHandled,
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
          projectLabel={projectLabel}
          projectRoot={projectRoot}
          services={services}
          terminalTheme={terminalTheme}
          onTerminalCountChange={onTerminalCountChange}
          fontSize={fontSize}
          onZoomIn={onZoomIn}
          onZoomOut={onZoomOut}
          paneStatus={paneStatus}
          visible={visible && active && !showEmptyState}
          onScreen={visible && active}
          keysActive={keysActive}
          onResumeSession={onResumeSession}
          actions={actions}
          onRunAction={onRunAction}
          onEditService={onEditService}
        />
      </div>
      {showEmptyState && (
        <EmptyTerminalState
          projectName={projectName}
          projectLabel={projectLabel}
          projectRoot={projectRoot}
          fontSize={fontSize}
          actions={actions ?? []}
          sessionHistory={sessionHistory}
          hiddenSessions={hiddenSessions}
          onResumeRow={onResumeRow}
          onNewTerminal={onNewTerminal}
          onRunCommand={(command) => terminalRef.current?.runCommand(command)}
          onOpenAgent={(launch) => terminalRef.current?.openAgent(launch)}
          onOpenLayout={(root) => terminalRef.current?.openLayout(root)}
          onRunAction={onRunAction}
          onResumeSession={onResumeSession}
          newTabAsked={newTabAsked}
          onNewTabHandled={onNewTabHandled}
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

import { memo, useEffect, useMemo } from "react";
import type { ITheme } from "@xterm/xterm";
import { InteractivePane, type InteractivePaneHandle } from "./InteractivePane";
import { Pane, type PaneHandle } from "./Pane";
import { HeaderTab } from "./terminal/HeaderTab";
import { IconBtn } from "./terminal/IconBtn";
import {
  PlusIcon,
  SplitRightIcon,
  SplitDownIcon,
  ClearIcon,
  ExpandIcon,
  ShrinkIcon,
} from "./terminal/icons";
import { TerminalSearchBar } from "./terminal/TerminalSearchBar";
import { XIcon } from "./icons";
import { Tooltip } from "./ui/Tooltip";
import { SortableTab, TabStrip } from "./TerminalTabDnd";
import { ALL_SERVICES, type PaneLeaf, type SplitDirection } from "../paneTree";

export type StatusKind = "Done" | "Waiting" | "Error";

/** A running service that the primary pane renders as an additional tab. */
export interface ServiceTabInfo {
  name: string;
  output: string;
  sessionKey: string;
  cwd: string;
}

export interface PaneViewProps {
  pane: PaneLeaf;
  visible: boolean;
  focused: boolean;
  fullscreen: boolean;
  searchActive: boolean;
  canClose: boolean;
  fontSize: number;
  themeOverride: ITheme | null;
  runningPaneIDs?: Set<string>;
  donePaneIDs?: Set<string>;
  waitingPaneIDs?: Set<string>;
  errorPaneIDs?: Set<string>;
  services?: ServiceTabInfo[];
  // Absolute working directory used to resolve relative paths printed in
  // interactive shells (typically the project root).
  interactiveCwd: string;
  onFocusPane: (paneId: string) => void;
  onFocusTab: (paneId: string, tabIdx: number) => void;
  onFocusService: (paneId: string, serviceName: string) => void;
  onAddTerminal: (paneId: string) => void;
  onCloseTerminal: (paneId: string, tabIdx: number) => void;
  onRenameTerminal: (paneId: string, tabIdx: number, label: string) => void;
  onSplit: (paneId: string, direction: SplitDirection) => void;
  onClosePane: (paneId: string) => void;
  onClearPane: (paneId: string) => void;
  onToggleFullscreen: (paneId: string) => void;
  onRegisterTerminalHandle: (
    terminalId: string,
    handle: InteractivePaneHandle | null,
  ) => void;
  onRegisterServiceHandle: (
    serviceName: string,
    handle: PaneHandle | null,
  ) => void;
  onClearStatus: (terminalId: string, kind: StatusKind) => void;
  onFindInPane: (paneId: string, query: string, direction: "next" | "prev") => boolean;
  onCloseSearch: () => void;
}

function PaneViewImpl(props: PaneViewProps) {
  const {
    pane,
    visible,
    focused,
    fullscreen,
    searchActive,
    canClose,
    fontSize,
    themeOverride,
    runningPaneIDs,
    donePaneIDs,
    waitingPaneIDs,
    errorPaneIDs,
    services = [],
    interactiveCwd,
    onFocusPane,
    onFocusTab,
    onFocusService,
    onAddTerminal,
    onCloseTerminal,
    onRenameTerminal,
    onSplit,
    onClosePane,
    onClearPane,
    onToggleFullscreen,
    onRegisterTerminalHandle,
    onRegisterServiceHandle,
    onClearStatus,
    onFindInPane,
    onCloseSearch,
  } = props;

  const hasMultipleServices = services.length > 1;
  const isAllActive =
    pane.activeServiceName === ALL_SERVICES && hasMultipleServices;
  const namedServiceName =
    pane.activeServiceName &&
    services.some((s) => s.name === pane.activeServiceName)
      ? pane.activeServiceName
      : null;
  const activeServiceName: string | null = isAllActive
    ? ALL_SERVICES
    : namedServiceName;
  const terminalIdx =
    pane.tabs.length === 0
      ? -1
      : Math.min(pane.activeTabIdx, pane.tabs.length - 1);
  const activeTerm = terminalIdx >= 0 ? pane.tabs[terminalIdx] : null;

  useEffect(() => {
    if (!visible || !focused || activeServiceName !== null || !activeTerm)
      return;
    if (donePaneIDs?.has(activeTerm.id)) onClearStatus(activeTerm.id, "Done");
    if (errorPaneIDs?.has(activeTerm.id)) onClearStatus(activeTerm.id, "Error");
  }, [
    visible,
    focused,
    activeServiceName,
    activeTerm,
    donePaneIDs,
    errorPaneIDs,
    onClearStatus,
  ]);

  const tabIds = useMemo(() => pane.tabs.map((t) => t.id), [pane.tabs]);

  const containerClass = fullscreen
    ? "fixed inset-0 z-50 flex flex-col overflow-hidden bg-[var(--terminal-bg)]"
    : "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden border-t border-x border-[var(--border)]";

  const headerClass = `flex items-center gap-0.5 bg-[var(--terminal-header)] px-2 py-1 border-b-1 ${
    focused && canClose
      ? "border-b-[var(--accent-cyan)]"
      : "border-b-[var(--terminal-header-hover)]"
  }`;

  return (
    <div
      className={containerClass}
      onMouseDownCapture={() => onFocusPane(pane.id)}
    >
      <div className={headerClass}>
        <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto">
          {hasMultipleServices && (
            <HeaderTab
              label="All"
              active={isAllActive}
              onClick={() => onFocusService(pane.id, ALL_SERVICES)}
            />
          )}
          {services.map((svc) => {
            const isActive = activeServiceName === svc.name;
            return (
              <HeaderTab
                key={`svc:${svc.name}`}
                label={svc.name}
                active={isActive}
                onClick={() => onFocusService(pane.id, svc.name)}
              />
            );
          })}
          {services.length > 0 && pane.tabs.length > 0 && (
            <div className="mx-1 h-3.5 w-px bg-[var(--terminal-header-hover)]" />
          )}
          <TabStrip paneId={pane.id} tabIds={tabIds}>
            {pane.tabs.map((t, i) => {
              const isActive = activeServiceName === null && i === terminalIdx;
              const isDone = donePaneIDs?.has(t.id) ?? false;
              // Waiting persists across tab clicks (user memory) so we don't
              // auto-clear it here, unlike Done/Error.
              const isWaiting = waitingPaneIDs?.has(t.id) ?? false;
              const isError = errorPaneIDs?.has(t.id) ?? false;
              return (
                <SortableTab key={t.id} id={t.id} paneId={pane.id} index={i}>
                  <HeaderTab
                    label={t.label}
                    active={isActive}
                    shimmer={runningPaneIDs?.has(t.id) ?? false}
                    done={!isActive && isDone}
                    waiting={isWaiting}
                    error={!isActive && isError}
                    onClick={() => {
                      if (isDone) onClearStatus(t.id, "Done");
                      if (isError) onClearStatus(t.id, "Error");
                      onFocusTab(pane.id, i);
                    }}
                    onClose={() => onCloseTerminal(pane.id, i)}
                    onRename={(name) => onRenameTerminal(pane.id, i, name)}
                  />
                </SortableTab>
              );
            })}
          </TabStrip>
          <button
            onClick={() => onAddTerminal(pane.id)}
            title="Open new terminal (⌘T)"
            className="flex items-center gap-1 rounded-md px-1.5 py-1 font-mono text-[11px] font-medium text-[var(--terminal-header-text)] transition-colors hover:bg-[var(--terminal-header-hover)] hover:text-[var(--terminal-tab-active)]"
          >
            <PlusIcon />
          </button>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <Tooltip
            content={
              <>
                Split right <span className="ml-1 opacity-70">⌘D</span>
              </>
            }
            side="bottom"
            align="end"
          >
            <IconBtn
              onClick={() => onSplit(pane.id, "row")}
              title="Split right (⌘D)"
            >
              <SplitRightIcon />
            </IconBtn>
          </Tooltip>
          <Tooltip
            content={
              <>
                Split down <span className="ml-1 opacity-70">⌘⇧D</span>
              </>
            }
            side="bottom"
            align="end"
          >
            <IconBtn
              onClick={() => onSplit(pane.id, "col")}
              title="Split down (⌘⇧D)"
            >
              <SplitDownIcon />
            </IconBtn>
          </Tooltip>
          <Tooltip content="Clear" side="bottom" align="end">
            <IconBtn onClick={() => onClearPane(pane.id)} title="Clear">
              <ClearIcon />
            </IconBtn>
          </Tooltip>
          <Tooltip
            content={fullscreen ? "Exit fullscreen" : "Fullscreen"}
            side="bottom"
            align="end"
          >
            <IconBtn
              onClick={() => onToggleFullscreen(pane.id)}
              title={fullscreen ? "Exit fullscreen (Esc)" : "Fullscreen"}
            >
              {fullscreen ? <ShrinkIcon /> : <ExpandIcon />}
            </IconBtn>
          </Tooltip>
          {canClose && (
            <Tooltip content="Close pane" side="bottom" align="end">
              <IconBtn onClick={() => onClosePane(pane.id)} title="Close pane">
                <XIcon />
              </IconBtn>
            </Tooltip>
          )}
        </div>
      </div>
      <div
        className={`relative flex min-h-0 min-w-0 flex-1 overflow-hidden ${isAllActive ? "divide-x divide-[var(--border)]" : ""}`}
      >
        {searchActive && (
          <TerminalSearchBar
            key={`${pane.id}:${activeServiceName ?? activeTerm?.id ?? "empty"}`}
            onFindNext={(query) => onFindInPane(pane.id, query, "next")}
            onFindPrevious={(query) => onFindInPane(pane.id, query, "prev")}
            onClose={onCloseSearch}
          />
        )}
        {services.map((svc) => {
          const isVisible = isAllActive || activeServiceName === svc.name;
          return (
            <div
              key={`svc:${svc.name}`}
              className={
                isVisible
                  ? "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
                  : "hidden"
              }
            >
              <Pane
                ref={(el) => onRegisterServiceHandle(svc.name, el)}
                sessionKey={svc.sessionKey}
                output={svc.output}
                visible={visible && isVisible}
                fontSize={fontSize}
                themeOverride={themeOverride}
                cwd={svc.cwd}
                label={isAllActive ? svc.name : undefined}
                onLabelClick={
                  isAllActive
                    ? () => onFocusService(pane.id, svc.name)
                    : undefined
                }
              />
            </div>
          );
        })}
        {pane.tabs.map((t, i) => {
          const isActive = activeServiceName === null && i === terminalIdx;
          return (
            <div
              key={t.id}
              className={
                isActive
                  ? "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
                  : "hidden"
              }
            >
              <InteractivePane
                ref={(el) => onRegisterTerminalHandle(t.id, el)}
                terminalId={t.id}
                visible={visible && isActive}
                fontSize={fontSize}
                themeOverride={themeOverride}
                cwd={interactiveCwd}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Memoize so divider drag (which only touches nodes along the split
// path) doesn't re-render panes whose leaf reference is stable. Parent
// must pass stable callback references for this to take effect.
export const PaneView = memo(PaneViewImpl);

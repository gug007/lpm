import { memo, useCallback, useEffect, useMemo } from "react";
import type { ITheme } from "@xterm/xterm";
import { InteractivePane, type InteractivePaneHandle } from "./InteractivePane";
import { Pane, type PaneHandle } from "./Pane";
import { HeaderTab } from "./terminal/HeaderTab";
import { IconBtn } from "./terminal/IconBtn";
import { PlusIcon, SplitRightIcon, SplitDownIcon, ClearIcon, ExpandIcon, ShrinkIcon } from "./terminal/icons";
import { XIcon } from "./icons";
import { Tooltip } from "./ui/Tooltip";
import { SortableItem, SortableList } from "./ui/SortableList";
import type { PaneLeaf, SplitDirection } from "../paneTree";

export type StatusKind = "Done" | "Waiting" | "Error";

/** A running service that the primary pane renders as an additional tab. */
export interface ServiceTabInfo {
  name: string;
  output: string;
}

export interface PaneViewProps {
  pane: PaneLeaf;
  visible: boolean;
  focused: boolean;
  fullscreen: boolean;
  canClose: boolean;
  fontSize: number;
  themeOverride: ITheme | null;
  runningPaneIDs?: Set<string>;
  donePaneIDs?: Set<string>;
  waitingPaneIDs?: Set<string>;
  errorPaneIDs?: Set<string>;
  services?: ServiceTabInfo[];
  onFocusPane: (paneId: string) => void;
  onFocusTab: (paneId: string, tabIdx: number) => void;
  onFocusService: (paneId: string, serviceName: string) => void;
  onAddTerminal: (paneId: string) => void;
  onCloseTerminal: (paneId: string, tabIdx: number) => void;
  onRenameTerminal: (paneId: string, tabIdx: number, label: string) => void;
  onReorderTerminals: (paneId: string, order: string[]) => void;
  onSplit: (paneId: string, direction: SplitDirection) => void;
  onClosePane: (paneId: string) => void;
  onClearPane: (paneId: string) => void;
  onToggleFullscreen: (paneId: string) => void;
  onRegisterTerminalHandle: (terminalId: string, handle: InteractivePaneHandle | null) => void;
  onRegisterServiceHandle: (serviceName: string, handle: PaneHandle | null) => void;
  onClearStatus: (terminalId: string, kind: StatusKind) => void;
}

function PaneViewImpl(props: PaneViewProps) {
  const {
    pane,
    visible,
    focused,
    fullscreen,
    canClose,
    fontSize,
    themeOverride,
    runningPaneIDs,
    donePaneIDs,
    waitingPaneIDs,
    errorPaneIDs,
    services = [],
    onFocusPane,
    onFocusTab,
    onFocusService,
    onAddTerminal,
    onCloseTerminal,
    onRenameTerminal,
    onReorderTerminals,
    onSplit,
    onClosePane,
    onClearPane,
    onToggleFullscreen,
    onRegisterTerminalHandle,
    onRegisterServiceHandle,
    onClearStatus,
  } = props;

  const activeServiceName =
    pane.activeServiceName && services.some((s) => s.name === pane.activeServiceName)
      ? pane.activeServiceName
      : null;
  const terminalIdx = pane.tabs.length === 0 ? -1 : Math.min(pane.activeTabIdx, pane.tabs.length - 1);
  const activeTerm = terminalIdx >= 0 ? pane.tabs[terminalIdx] : null;

  useEffect(() => {
    if (!visible || !focused || activeServiceName !== null || !activeTerm) return;
    if (donePaneIDs?.has(activeTerm.id)) onClearStatus(activeTerm.id, "Done");
    if (errorPaneIDs?.has(activeTerm.id)) onClearStatus(activeTerm.id, "Error");
  }, [visible, focused, activeServiceName, activeTerm, donePaneIDs, errorPaneIDs, onClearStatus]);

  const handleReorder = useCallback(
    (order: string[]) => onReorderTerminals(pane.id, order),
    [pane.id, onReorderTerminals],
  );
  const tabIds = useMemo(() => pane.tabs.map((t) => t.id), [pane.tabs]);

  const containerClass = fullscreen
    ? "fixed inset-0 z-50 flex flex-col overflow-hidden bg-[var(--terminal-bg)]"
    : `flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden border border-[var(--border)] ${
        focused ? "ring-1 ring-inset ring-[var(--accent-cyan)]" : ""
      }`;

  return (
    <div
      className={containerClass}
      onMouseDownCapture={() => onFocusPane(pane.id)}
    >
      <div className="flex items-center gap-0.5 bg-[var(--terminal-header)] px-2 py-1">
        <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto">
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
          <SortableList ids={tabIds} direction="horizontal" onReorder={handleReorder}>
            {pane.tabs.map((t, i) => {
              const isActive = activeServiceName === null && i === terminalIdx;
              const isDone = donePaneIDs?.has(t.id) ?? false;
              // Waiting persists across tab clicks (user memory) so we don't
              // auto-clear it here, unlike Done/Error.
              const isWaiting = waitingPaneIDs?.has(t.id) ?? false;
              const isError = errorPaneIDs?.has(t.id) ?? false;
              return (
                <SortableItem key={t.id} id={t.id}>
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
                </SortableItem>
              );
            })}
          </SortableList>
          <button
            onClick={() => onAddTerminal(pane.id)}
            title="Open new terminal (⌘T)"
            className="flex items-center gap-1 rounded-md px-1.5 py-1 font-mono text-[11px] font-medium text-[var(--terminal-header-text)] transition-colors hover:bg-[var(--terminal-header-hover)] hover:text-[var(--terminal-tab-active)]"
          >
            <PlusIcon />
          </button>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <Tooltip content="Split right" side="bottom" align="end">
            <IconBtn onClick={() => onSplit(pane.id, "row")} title="Split right"><SplitRightIcon /></IconBtn>
          </Tooltip>
          <Tooltip content="Split down" side="bottom" align="end">
            <IconBtn onClick={() => onSplit(pane.id, "col")} title="Split down"><SplitDownIcon /></IconBtn>
          </Tooltip>
          <Tooltip content="Clear" side="bottom" align="end">
            <IconBtn onClick={() => onClearPane(pane.id)} title="Clear"><ClearIcon /></IconBtn>
          </Tooltip>
          <Tooltip content={fullscreen ? "Exit fullscreen" : "Fullscreen"} side="bottom" align="end">
            <IconBtn
              onClick={() => onToggleFullscreen(pane.id)}
              title={fullscreen ? "Exit fullscreen (Esc)" : "Fullscreen"}
            >
              {fullscreen ? <ShrinkIcon /> : <ExpandIcon />}
            </IconBtn>
          </Tooltip>
          {canClose && (
            <Tooltip content="Close pane" side="bottom" align="end">
              <IconBtn onClick={() => onClosePane(pane.id)} title="Close pane"><XIcon /></IconBtn>
            </Tooltip>
          )}
        </div>
      </div>
      <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
        {services.map((svc) => {
          const isActive = activeServiceName === svc.name;
          return (
            <div
              key={`svc:${svc.name}`}
              className={isActive ? "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden" : "hidden"}
            >
              <Pane
                ref={(el) => onRegisterServiceHandle(svc.name, el)}
                output={svc.output}
                visible={visible && isActive}
                fontSize={fontSize}
                themeOverride={themeOverride}
              />
            </div>
          );
        })}
        {pane.tabs.map((t, i) => {
          const isActive = activeServiceName === null && i === terminalIdx;
          return (
            <div
              key={t.id}
              className={isActive ? "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden" : "hidden"}
            >
              <InteractivePane
                ref={(el) => onRegisterTerminalHandle(t.id, el)}
                terminalId={t.id}
                visible={visible && isActive}
                fontSize={fontSize}
                themeOverride={themeOverride}
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

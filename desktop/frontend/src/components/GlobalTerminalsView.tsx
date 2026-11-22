import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PageRunContext } from "../popup/pageRun";
import { usePageRunner } from "../popup/usePageRunner";
import { useAppStore } from "../store/app";
import { TerminalView, type TerminalViewHandle } from "./TerminalView";
import { TerminalFooter } from "./TerminalFooter";
import { headerWrapKey } from "./actionsDndLayout";
import { Header } from "./project-detail/Header";
import { HeaderActions } from "./project-detail/HeaderActions";
import { EMPTY_SERVICES, noop } from "./project-detail/constants";
import { useTerminalFontSize } from "../hooks/useTerminalFontSize";
import { useTerminalTheme } from "../hooks/useTerminalTheme";
import { useKeyboardShortcut } from "../hooks/useKeyboardShortcut";
import { useProjectActions } from "../hooks/useProjectActions";
import { useActionsByDisplay } from "../hooks/useActionsByDisplay";
import { useOverflowWrap } from "../hooks/useOverflowWrap";
import type { LaunchpadProject } from "../hooks/useLaunchpad";
import { useGlobalTerminalStatus } from "../hooks/useGlobalTerminalStatus";
import { ActionInputsModal } from "./project-detail/ActionInputsModal";
import { ActionRunCard } from "./project-detail/ActionRunCard";
import { ConfirmDialog } from "./ui/ConfirmDialog";
import { TerminalIcon } from "./icons";
import { GetProject } from "../../bridge/commands";
import type { ActionInfo, ProjectInfo, ZoneInfo } from "../types";
import {
  GLOBAL_TERMINALS_KEY,
  countPersistedTabs,
  getProjectTerminals,
} from "../terminals";
import { chordLabel } from "../keys";
import type { RemoteAgentLaunch } from "../remoteAgentTabs";
import { NewTerminalButton } from "./terminal/NewTerminalButton";

interface GlobalTerminalsViewProps {
  visible?: boolean;
  sidebarCollapsed?: boolean;
}

const LABEL = "Terminals";
const NO_ACTIONS: { actions: ActionInfo[]; zones: ZoneInfo[] } = { actions: [], zones: [] };

export function GlobalTerminalsView({
  visible = true,
  sidebarCollapsed = false,
}: GlobalTerminalsViewProps) {
  const [terminalCount, setTerminalCount] = useState(() => {
    const saved = getProjectTerminals(GLOBAL_TERMINALS_KEY);
    return countPersistedTabs(saved.panes);
  });

  const terminalRef = useRef<TerminalViewHandle>(null);
  const { theme: terminalTheme, themeStyle } = useTerminalTheme();
  const { fontSize, zoomIn, zoomOut } = useTerminalFontSize();
  const paneStatus = useGlobalTerminalStatus();

  // The sidebar asked to put one of these tabs on screen. The store switched to
  // this view; focus the tab once per nonce, and only once the view is showing.
  const pendingFocusTerminal = useAppStore((s) => s.pendingFocusTerminal);
  const clearPendingFocusTerminal = useAppStore((s) => s.clearPendingFocusTerminal);
  const focusTerminalConsumed = useRef(0);
  useEffect(() => {
    if (
      !visible ||
      !pendingFocusTerminal ||
      pendingFocusTerminal.projectName !== GLOBAL_TERMINALS_KEY ||
      focusTerminalConsumed.current === pendingFocusTerminal.nonce
    ) {
      return;
    }
    focusTerminalConsumed.current = pendingFocusTerminal.nonce;
    const { terminalId } = pendingFocusTerminal;
    clearPendingFocusTerminal();
    terminalRef.current?.focusTerminalById(terminalId);
  }, [visible, pendingFocusTerminal, clearPendingFocusTerminal]);

  const [{ actions, zones }, setConfig] = useState(NO_ACTIONS);
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    GetProject(GLOBAL_TERMINALS_KEY)
      .then((info: ProjectInfo) => { if (!cancelled) setConfig({ actions: info.actions, zones: info.zones ?? [] }); })
      .catch(() => { if (!cancelled) setConfig(NO_ACTIONS); });
    return () => { cancelled = true; };
  }, [visible]);
  const { headerItems, footerItems, layout } = useActionsByDisplay(actions, zones);
  const hasZones = headerItems.some((item) => item.kind === "zone");
  const { wrapped, rowRef, innerRef } = useOverflowWrap([headerWrapKey(layout, zones)]);
  const newTabProject = useMemo<LaunchpadProject>(
    () => ({ name: GLOBAL_TERMINALS_KEY, label: LABEL, root: "", actions }),
    [actions],
  );

  const handleNewTerminal = useCallback((shell?: string) => {
    terminalRef.current?.createTerminal(false, shell);
  }, []);
  // With no pane for ⌘T's popup to open on, the empty state shows it.
  const [newTabAsked, setNewTabAsked] = useState(false);
  const handleNewTab = useCallback(() => {
    if (terminalRef.current?.openNewTab() === false) setNewTabAsked(true);
  }, []);
  const clearNewTabAsked = useCallback(() => setNewTabAsked(false), []);
  const openAgent = useCallback(
    (launch: RemoteAgentLaunch) => terminalRef.current?.openAgent(launch),
    [],
  );
  const runCommand = useCallback(
    (command: string, shell?: string) => terminalRef.current?.runCommand(command, shell),
    [],
  );
  useKeyboardShortcut({ key: "t", meta: true }, handleNewTab, visible);

  const { handleRunAction, runningAction, modals } = useProjectActions({
    projectName: GLOBAL_TERMINALS_KEY,
    terminalViewRef: terminalRef,
    onSwitchToTerminal: noop,
  });
  const runFromPage = usePageRunner(actions, handleRunAction);

  const showEmptyState = terminalCount === 0;
  const actionsRow = headerItems.length > 0 && (
    <HeaderActions
      items={headerItems}
      layout={layout}
      wrapped={wrapped}
      alignTop={hasZones}
      projectName={GLOBAL_TERMINALS_KEY}
      disabled={runningAction !== null}
      onRun={handleRunAction}
    />
  );

  return (
    <PageRunContext.Provider value={runFromPage}>
      <div className="flex h-full flex-col">
        <Header
          projectName={LABEL}
          showProjectName={true}
          sidebarCollapsed={sidebarCollapsed}
          rowRef={rowRef}
          innerRef={innerRef}
          actionsWrapped={wrapped}
          actions={actionsRow}
          controls={null}
          alignTop={hasZones}
        />

        <div className="relative mt-1.5 -mx-6 -mb-6 flex min-h-0 flex-1 flex-col overflow-hidden" style={themeStyle}>
          {showEmptyState && (
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-hidden">
              <div className="flex max-w-sm flex-col items-center gap-5 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--bg-hover)] text-[var(--text-muted)] [&_svg]:h-[26px] [&_svg]:w-[26px]">
                  <TerminalIcon />
                </div>
                <div className="flex flex-col items-center gap-1.5">
                  <h3 className="text-sm font-medium text-[var(--text-primary)]">No terminals yet</h3>
                  <p className="text-xs text-[var(--text-muted)]">
                    Quick shells for scripts, system commands, and anything that isn't tied to a single project.
                  </p>
                </div>
                <NewTerminalButton
                  project={newTabProject}
                  onNewTerminal={handleNewTerminal}
                  onRunCommand={runCommand}
                  onOpenAgent={openAgent}
                  onRunAction={handleRunAction}
                  openRequested={newTabAsked}
                  onOpenRequestHandled={clearNewTabAsked}
                  className="flex items-center gap-2 rounded-lg bg-[var(--text-primary)] px-4 py-2 text-xs font-medium text-[var(--bg-primary)] transition-all hover:opacity-85"
                >
                  <TerminalIcon />
                  New Terminal
                  <kbd className="ml-1 text-[10px] opacity-70">{chordLabel({ key: "t", meta: true })}</kbd>
                </NewTerminalButton>
              </div>
            </div>
          )}

          <div className={showEmptyState ? "hidden" : "contents"}>
            <TerminalView
              ref={terminalRef}
              projectName={GLOBAL_TERMINALS_KEY}
              projectLabel={LABEL}
              projectRoot=""
              services={EMPTY_SERVICES}
              terminalTheme={terminalTheme}
              onTerminalCountChange={setTerminalCount}
              fontSize={fontSize}
              onZoomIn={zoomIn}
              onZoomOut={zoomOut}
              paneStatus={paneStatus}
              visible={visible && !showEmptyState}
              onScreen={visible}
              actions={actions}
              onRunAction={handleRunAction}
            />
          </div>
          <TerminalFooter
            projectName={GLOBAL_TERMINALS_KEY}
            projectPath=""
            items={footerItems}
            layout={layout}
            onRunAction={handleRunAction}
            disabled={runningAction !== null}
          />
        </div>

        <ConfirmDialog
          open={modals.confirm.action !== null}
          body={
            <>
              Run <span className="font-medium text-[var(--text-primary)]">{modals.confirm.action?.label}</span>?
            </>
          }
          confirmLabel="Run"
          onCancel={modals.confirm.onCancel}
          onConfirm={modals.confirm.onConfirm}
        />
        {modals.inputs.action && (
          <ActionInputsModal
            projectName={GLOBAL_TERMINALS_KEY}
            action={modals.inputs.action}
            initial={modals.inputs.initial}
            onCancel={modals.inputs.onCancel}
            onSubmit={modals.inputs.onSubmit}
          />
        )}
        {modals.running.shown && (
          <ActionRunCard
            key={modals.running.shown.id}
            label={modals.running.shown.action.label}
            runKey={modals.running.shown.runKey}
            run={modals.running.shown.run}
            startedAt={modals.running.shown.startedAt}
            onClose={modals.running.onClose}
            onRunAgain={modals.running.onRunAgain}
          />
        )}
      </div>
    </PageRunContext.Provider>
  );
}

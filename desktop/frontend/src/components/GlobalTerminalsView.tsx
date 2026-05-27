import { useCallback, useEffect, useRef, useState } from "react";
import { TerminalView, type TerminalViewHandle } from "./TerminalView";
import { ActionView } from "./ActionView";
import { Header } from "./project-detail/Header";
import { useOverflowWrap } from "../hooks/useOverflowWrap";
import { useTerminalFontSize } from "../hooks/useTerminalFontSize";
import { useTerminalTheme } from "../hooks/useTerminalTheme";
import { useKeyboardShortcut } from "../hooks/useKeyboardShortcut";
import { useProjectActions } from "../hooks/useProjectActions";
import { ActionInputsModal } from "./project-detail/ActionInputsModal";
import { ActionTerminal } from "./project-detail/ActionTerminal";
import { ConfirmDialog } from "./ui/ConfirmDialog";
import { TerminalIcon } from "./icons";
import { GetProject } from "../../wailsjs/go/main/App";
import type { ActionInfo, ProjectInfo } from "../types";
import {
  GLOBAL_TERMINALS_KEY,
  countPersistedTabs,
  getProjectTerminals,
} from "../terminals";

const NO_SERVICES: { name: string; cwd?: string }[] = [];

interface GlobalTerminalsViewProps {
  visible?: boolean;
  sidebarCollapsed?: boolean;
}

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

  const [actions, setActions] = useState<ActionInfo[]>([]);
  useEffect(() => {
    if (!visible) return;
    GetProject(GLOBAL_TERMINALS_KEY)
      .then((info: ProjectInfo) => setActions(info?.actions ?? []))
      .catch(() => setActions([]));
  }, [visible]);

  const handleNewTerminal = useCallback(() => {
    terminalRef.current?.createTerminal();
  }, []);
  useKeyboardShortcut({ key: "t", meta: true }, handleNewTerminal, visible);

  const { handleRunAction, runningAction, modals } = useProjectActions({
    projectName: GLOBAL_TERMINALS_KEY,
    terminalViewRef: terminalRef,
    onSwitchToTerminal: () => {},
  });

  const { wrapped, rowRef, innerRef } = useOverflowWrap([actions.length]);

  const showEmptyState = terminalCount === 0;
  const actionsRow = actions.length > 0 && (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {actions.map((a) => (
        <ActionView
          key={a.name}
          action={a}
          compact={false}
          disabled={runningAction !== null}
          onRun={handleRunAction}
        />
      ))}
    </div>
  );

  return (
    <div className="flex h-full flex-col">
      <Header
        projectName="Terminals"
        showProjectName={true}
        sidebarCollapsed={sidebarCollapsed}
        rowRef={rowRef}
        innerRef={innerRef}
        actionsWrapped={wrapped}
        actions={actionsRow}
        controls={null}
      />

      {showEmptyState && (
        <div className="mt-1.5 -mx-6 -mb-6 flex min-h-0 flex-1 flex-col items-center justify-center overflow-hidden">
          <div className="flex max-w-sm flex-col items-center gap-5 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--bg-hover)] text-[var(--text-muted)]">
              <svg width={26} height={26} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                <polyline points="4 17 10 11 4 5" />
                <line x1="12" y1="19" x2="20" y2="19" />
              </svg>
            </div>
            <div className="flex flex-col items-center gap-1.5">
              <h3 className="text-sm font-medium text-[var(--text-primary)]">No terminals yet</h3>
              <p className="text-xs text-[var(--text-muted)]">
                Quick shells for scripts, system commands, and anything that isn't tied to a single project.
              </p>
            </div>
            <button
              onClick={handleNewTerminal}
              className="flex items-center gap-2 rounded-lg bg-[var(--text-primary)] px-4 py-2 text-xs font-medium text-[var(--bg-primary)] transition-all hover:opacity-85"
            >
              <TerminalIcon />
              New Terminal
              <kbd className="ml-1 text-[10px] opacity-70">⌘T</kbd>
            </button>
          </div>
        </div>
      )}

      <div
        className={
          showEmptyState
            ? "hidden"
            : "relative mt-1.5 -mx-6 -mb-6 flex min-h-0 flex-1 flex-col overflow-hidden"
        }
        style={themeStyle}
      >
        <TerminalView
          ref={terminalRef}
          projectName={GLOBAL_TERMINALS_KEY}
          projectRoot=""
          services={NO_SERVICES}
          terminalTheme={terminalTheme}
          onTerminalCountChange={setTerminalCount}
          fontSize={fontSize}
          onZoomIn={zoomIn}
          onZoomOut={zoomOut}
          visible={visible && !showEmptyState}
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
          action={modals.inputs.action}
          onCancel={modals.inputs.onCancel}
          onSubmit={modals.inputs.onSubmit}
        />
      )}
      {modals.running.action && (
        <ActionTerminal label={modals.running.action.label} onClose={modals.running.onClose} />
      )}
    </div>
  );
}

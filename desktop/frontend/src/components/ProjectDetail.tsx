import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { toast } from "sonner";
import { ActionView } from "./ActionView";
import { OpenInDropdown } from "./OpenInDropdown";
import { TerminalView, type TerminalViewHandle } from "./TerminalView";
import { TerminalFooter } from "./TerminalFooter";
import { ConfigEditor } from "./ConfigEditor";
import { NotesView } from "./NotesView";
import { RunAction, RunActionBackground } from "../../wailsjs/go/main/App";
import { useAppStore } from "../store/app";
import { ActionsDnd, ActionsGroup } from "./ActionsDnd";
import { SortableItem } from "./ui/SortableList";
import { getSettings, saveSettings } from "../settings";
import { getProjectTerminals, saveProjectTerminals, countPersistedTabs } from "../terminals";
import { type TerminalThemeName, terminalThemeNames, getTerminalThemeColors, terminalThemeCssVars } from "../terminal-themes";
import { type ProjectInfo, type ProfileInfo, type ActionInfo, type ActionsLayout, STATUS_RUNNING, STATUS_DONE, STATUS_WAITING, STATUS_ERROR, isHeaderDisplay, isFooterDisplay } from "../types";
import { TerminalIcon, CheckIcon, ChevronDownIcon, PencilIcon, MenuIcon, AlertCircleIcon, PlayIcon, StopIcon, MessageIcon } from "./icons";
import { ConfirmDialog } from "./ui/ConfirmDialog";
import { useOutsideClick } from "../hooks/useOutsideClick";
import { useKeyboardShortcut } from "../hooks/useKeyboardShortcut";
import { useOverflowWrap } from "../hooks/useOverflowWrap";
import { ActionTerminal } from "./project-detail/ActionTerminal";
import { ActionInputsModal } from "./project-detail/ActionInputsModal";
import { QuickPopover } from "./project-detail/QuickPopover";
import { TerminalSettingsModal } from "./project-detail/TerminalSettingsModal";
import { PortsButton } from "./project-detail/PortsButton";

const EMPTY_SERVICES: { name: string }[] = [];

const noop = () => {};

interface ProjectDetailProps {
  project: ProjectInfo;
  visible?: boolean;
  sidebarCollapsed?: boolean;
  onStart: (name: string, profile: string) => Promise<void>;
  onToggleService: (name: string, serviceName: string) => Promise<void>;
  onStop: (name: string) => Promise<void>;
  onRestart: (name: string, profile: string) => Promise<void>;
  onRefresh: (newName?: string) => void;
  onRemove: (name: string) => Promise<void>;
}

export function ProjectDetail({
  project,
  visible = true,
  sidebarCollapsed = false,
  onStart,
  onToggleService,
  onStop,
  onRestart,
  onRefresh,
  onRemove,
}: ProjectDetailProps) {
  const [loading, setLoading] = useState(false);
  const [activeProfile, setActiveProfile] = useState(
    project.activeProfile || project.profiles?.[0]?.name || ""
  );
  useEffect(() => {
    if (project.activeProfile && project.activeProfile !== activeProfile) {
      setActiveProfile(project.activeProfile);
    }
  }, [project.activeProfile, activeProfile]);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [showQuickMenu, setShowQuickMenu] = useState(false);
  const [showTerminalSettings, setShowTerminalSettings] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const profileMenuRef = useOutsideClick<HTMLDivElement>(
    () => setShowProfileMenu(false),
    showProfileMenu,
  );

  const saved = getSettings().terminalTheme;
  const [termTheme, setTermTheme] = useState<TerminalThemeName>(
    saved && terminalThemeNames.includes(saved as TerminalThemeName) ? saved as TerminalThemeName : "claude-dark"
  );

  const handleTerminalThemeChange = (theme: TerminalThemeName) => {
    setTermTheme(theme);
    saveSettings({ terminalTheme: theme === "default" ? undefined : theme });
  };

  const terminalThemeStyle = useMemo(() => {
    const colors = getTerminalThemeColors(termTheme);
    return colors ? (terminalThemeCssVars(colors) as React.CSSProperties) : undefined;
  }, [termTheme]);

  const [fontSize, setFontSize] = useState(() => getSettings().terminalFontSize || 12);
  useEffect(() => {
    if (getSettings().terminalFontSize !== fontSize) saveSettings({ terminalFontSize: fontSize });
  }, [fontSize]);
  const zoomIn = useCallback(() => setFontSize((s) => Math.min(s + 1, 24)), []);
  const zoomOut = useCallback(() => setFontSize((s) => Math.max(s - 1, 8)), []);

  const withLoading = async (fn: () => Promise<void>) => {
    setLoading(true);
    try {
      await fn();
    } finally {
      setLoading(false);
    }
  };

  const handleStart = () =>
    withLoading(async () => {
      await onStart(project.name, activeProfile);
      setDetailView("terminal");
    });

  const runningServiceNames = useMemo(
    () => (project.running ? new Set(project.services.map((s) => s.name)) : null),
    [project.running, project.services],
  );

  const handleStartProfile = (profile: string) => {
    setActiveProfile(profile);
    setShowProfileMenu(false);
    withLoading(async () => {
      await onStart(project.name, profile);
      setDetailView("terminal");
    });
  };

  const handleToggleServiceClick = (serviceName: string) =>
    withLoading(async () => {
      await onToggleService(project.name, serviceName);
      setDetailView("terminal");
    });

  const terminalViewRef = useRef<TerminalViewHandle>(null);

  const { headerActions, footerActions, menuActions, headerIds, footerIds, actionsLayout } = useMemo(() => {
    const header: ActionInfo[] = [];
    const footer: ActionInfo[] = [];
    const menu: ActionInfo[] = [];
    const headerIds: string[] = [];
    const footerIds: string[] = [];
    for (const a of project.actions ?? []) {
      if (isHeaderDisplay(a.display)) { header.push(a); headerIds.push(a.name); }
      else if (isFooterDisplay(a.display)) { footer.push(a); footerIds.push(a.name); }
      else if (a.display === "menu") menu.push(a);
    }
    const layout: ActionsLayout = { header: headerIds, footer: footerIds };
    return { headerActions: header, footerActions: footer, menuActions: menu, headerIds, footerIds, actionsLayout: layout };
  }, [project.actions]);

  const reorderActions = useAppStore((s) => s.reorderActions);
  const handleMoveActions = useCallback(
    (next: ActionsLayout) => reorderActions(project.name, next),
    [reorderActions, project.name],
  );

  // Looks up the in-flight action by id so DragOverlay can render an
  // identical button at the cursor — without it the dragged button leaves
  // the header's stacking context and gets painted under TerminalView.
  const renderActionOverlay = useCallback(
    (id: string) => {
      const action = (project.actions ?? []).find((a) => a.name === id);
      if (!action) return null;
      return (
        <ActionView
          action={action}
          compact={isFooterDisplay(action.display)}
          disabled={false}
          onRun={noop}
        />
      );
    },
    [project.actions],
  );

  const [runningAction, setRunningAction] = useState<ActionInfo | null>(null);
  const [confirmAction, setConfirmAction] = useState<ActionInfo | null>(null);
  const [inputsAction, setInputsAction] = useState<ActionInfo | null>(null);
  const [pendingInputValues, setPendingInputValues] = useState<Record<string, string> | null>(null);

  const handleRunAction = (action: ActionInfo) => {
    if (action.inputs && action.inputs.length > 0) {
      setInputsAction(action);
      return;
    }
    if (action.confirm) {
      setConfirmAction(action);
      return;
    }
    executeAction(action);
  };

  const handleInputsSubmit = (values: Record<string, string>) => {
    const action = inputsAction;
    if (!action) return;
    setInputsAction(null);
    if (action.confirm) {
      setPendingInputValues(values);
      setConfirmAction(action);
      return;
    }
    executeAction(action, values);
  };

  const executeAction = async (action: ActionInfo, inputValues: Record<string, string> = {}) => {
    setConfirmAction(null);
    setPendingInputValues(null);
    if (action.type === "terminal") {
      switchDetailView("terminal");
      try {
        // Route no-input terminals through the restore-aware RPC so the
        // backend can rewrite startCmd/resumeCmd; templated ones substitute
        // here and run ad-hoc.
        const actionName = action.reuse ? action.name : undefined;
        if (!action.inputs?.length) {
          await terminalViewRef.current?.createTerminalWithCmd(action.label, action.cmd, {
            configName: action.name,
            actionName,
          });
          return;
        }
        const cmd = Object.entries(inputValues).reduce(
          (acc, [k, v]) => acc.replaceAll(`{{${k}}}`, v),
          action.cmd,
        );
        await terminalViewRef.current?.createTerminalWithCmd(action.label, cmd, {
          cwd: action.cwd,
          env: action.env,
          actionName,
        });
      } catch (err) {
        toast.error(`${action.label}: ${err}`);
      }
      return;
    }
    if (action.type === "background") {
      toast.promise(RunActionBackground(project.name, action.name, inputValues), {
        loading: `${action.label}…`,
        success: `${action.label} done`,
        error: (err) => `${action.label}: ${err}`,
      });
      return;
    }
    try {
      await RunAction(project.name, action.name, inputValues);
      setRunningAction(action);
    } catch (err) {
      toast.error(`${action.label}: ${err}`);
    }
  };

  const hasProfiles = project.profiles && project.profiles.length > 0;
  type DetailView = "terminal" | "config" | "notes";
  const [detailView, setDetailView] = useState<DetailView>("terminal");

  useEffect(() => {
    if (!visible && detailView !== "terminal") setDetailView("terminal");
  }, [visible, detailView]);

  const [terminalCount, setTerminalCount] = useState(() => {
    const saved = getProjectTerminals(project.name);
    return countPersistedTabs(saved.panes) || (saved.terminals?.length ?? 0);
  });
  const showEmptyState = !project.running && detailView === "terminal" && terminalCount === 0;

  useKeyboardShortcut(
    { key: "e", meta: true },
    () => switchDetailView(detailView === "config" ? "terminal" : "config"),
    visible,
  );

  useKeyboardShortcut(
    { key: "n", meta: true, shift: true },
    () => switchDetailView(detailView === "notes" ? "terminal" : "notes"),
    visible,
  );

  const switchDetailView = (view: DetailView) => {
    setDetailView(view);
    const state = getProjectTerminals(project.name);
    saveProjectTerminals(project.name, { ...state, detailView: view });
  };

  const handleNewTerminal = () => {
    switchDetailView("terminal");
    terminalViewRef.current?.createTerminal();
  };

  useKeyboardShortcut(
    { key: "t", meta: true },
    handleNewTerminal,
    visible,
  );

  const [runningPaneIDs, donePaneIDs, waitingPaneIDs, errorPaneIDs] = useMemo(() => {
    const running = new Set<string>();
    const done = new Set<string>();
    const waiting = new Set<string>();
    const error = new Set<string>();
    for (const e of project.statusEntries ?? []) {
      if (!e.paneID) continue;
      if (e.value === STATUS_RUNNING) running.add(e.paneID);
      else if (e.value === STATUS_DONE) done.add(e.paneID);
      else if (e.value === STATUS_WAITING) waiting.add(e.paneID);
      else if (e.value === STATUS_ERROR) error.add(e.paneID);
    }
    return [running, done, waiting, error] as const;
  }, [project.statusEntries]);


  const showProjectName = getSettings().showProjectName !== false;

  const hasActions = headerActions.length > 0;

  const {
    wrapped: actionsWrapped,
    rowRef: headerRowRef,
    innerRef: innerContainerRef,
  } = useOverflowWrap([
    headerActions.length,
    showProjectName,
    project.running,
    project.allServices.length,
  ]);

  if (project.configError) {
    return (
      <div className="flex h-full flex-col">
        <div className={`wails-drag flex items-center gap-4 -mx-3 py-1 transition-[padding] duration-200 ${sidebarCollapsed ? "pl-[100px]" : ""}`}>
          {showProjectName && (
            <h1 className="shrink-0 text-xl font-semibold tracking-tight">
              {project.name}
            </h1>
          )}
        </div>
        {detailView === "config" ? (
          <div className="mt-1.5 -mx-6 -mb-6 flex flex-1 flex-col overflow-hidden">
            <ConfigEditor
              projectName={project.name}
              onSaved={onRefresh}
              onBack={() => switchDetailView("terminal")}
              onToggleView={() => switchDetailView("terminal")}
            />
          </div>
        ) : (
          <div className="mt-1.5 -mx-6 -mb-6 flex min-h-0 flex-1 flex-col items-center justify-center overflow-hidden">
            <div className="flex flex-col items-center gap-4 max-w-md text-center">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-500/10 text-red-500">
                <AlertCircleIcon />
              </div>
              <p className="text-sm font-medium text-[var(--text-primary)]">Invalid configuration</p>
              <pre className="whitespace-pre-wrap rounded-lg bg-[var(--bg-sidebar)] p-4 text-left text-xs text-red-400 w-full">{project.configError}</pre>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => switchDetailView("config")}
                  className="flex items-center gap-2 rounded-lg bg-[var(--text-primary)] px-4 py-2 text-xs font-medium text-[var(--bg-primary)] transition-all hover:opacity-85"
                >
                  <PencilIcon />
                  Edit Config
                </button>
                <button
                  onClick={() => onRefresh()}
                  className="flex items-center gap-2 rounded-lg border border-[var(--border)] px-4 py-2 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                >
                  Retry
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  const actionsNode = hasActions ? (
    <ActionsGroup
      group="header"
      ids={headerIds}
      className={
        actionsWrapped
          ? "flex flex-wrap items-center justify-end gap-2"
          : "flex shrink-0 items-center gap-2"
      }
      style={{ "--wails-draggable": "no-drag" } as React.CSSProperties}
    >
      {headerActions.map((action) => (
        <SortableItem key={action.name} id={action.name}>
          <ActionView
            action={action}
            compact={false}
            disabled={runningAction !== null}
            onRun={handleRunAction}
          />
        </SortableItem>
      ))}
    </ActionsGroup>
  ) : null;

  const controlsNode = (
    <>
      {project.isRemote && <PortsButton projectName={project.name} />}
      <div style={{ "--wails-draggable": "no-drag" } as React.CSSProperties}>
        <OpenInDropdown projectPath={project.root} />
      </div>
      <div className="relative" style={{ "--wails-draggable": "no-drag" } as React.CSSProperties}>
        <button
          onClick={() => { setShowProfileMenu(false); setShowQuickMenu((v) => !v); }}
          aria-label="Project actions"
          className={`flex items-center justify-center rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors ${
            showQuickMenu
              ? "border-transparent bg-[var(--bg-active)] text-[var(--text-primary)]"
              : "border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
          }`}
        >
          <MenuIcon />
        </button>
        {showQuickMenu && (
          <QuickPopover
            actions={menuActions}
            running={project.running}
            actionBusy={runningAction !== null}
            onClose={() => setShowQuickMenu(false)}
            onRunAction={handleRunAction}
            onEditConfig={() => switchDetailView("config")}
            onOpenNotes={() => switchDetailView("notes")}
            onRestart={() => withLoading(() => onRestart(project.name, activeProfile))}
            onRemove={() => setConfirmRemove(true)}
            onTerminalSettings={() => setShowTerminalSettings(true)}
          />
        )}
      </div>
      {project.allServices.length === 0 ? null : (
        <div ref={profileMenuRef} className="relative flex" style={{ "--wails-draggable": "no-drag" } as React.CSSProperties}>
          {project.running ? (
            <button
              onClick={() =>
                withLoading(async () => {
                  await onStop(project.name);
                  switchDetailView("terminal");
                })
              }
              disabled={loading}
              className={`${project.allServices.length > 1 ? "rounded-l-lg" : "rounded-lg"} px-3.5 py-1.5 text-xs font-medium transition-all disabled:opacity-40 bg-[var(--accent-red)] text-white hover:opacity-85`}
            >
              Stop
            </button>
          ) : (
            <button
              onClick={handleStart}
              disabled={loading}
              className={`${project.allServices.length > 1 ? "rounded-l-lg" : "rounded-lg"} px-3.5 py-1.5 text-xs font-medium transition-all disabled:opacity-40 bg-[var(--text-primary)] text-[var(--bg-primary)] hover:opacity-85`}
            >
              Start
            </button>
          )}
          {project.allServices.length > 1 && (
            <button
              onClick={() => { setShowQuickMenu(false); setShowProfileMenu((v) => !v); }}
              disabled={loading}
              className={`rounded-r-lg border-l px-1.5 py-1.5 transition-all disabled:opacity-40 hover:opacity-85 ${
                project.running
                  ? "border-white/20 bg-[var(--accent-red)] text-white"
                  : "border-[var(--bg-primary)]/20 bg-[var(--text-primary)] text-[var(--bg-primary)]"
              }`}
            >
              <ChevronDownIcon />
            </button>
          )}
          {project.allServices.length > 1 && showProfileMenu && (
            <div className="absolute right-0 top-full z-50 mt-2 min-w-[280px] max-w-[340px] overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)] shadow-2xl">
              {hasProfiles && (
                <StartMenuSection label="Profiles">
                  {project.profiles.map((p) => (
                    <ProfileMenuItem
                      key={p.name}
                      profile={p}
                      running={project.running && project.activeProfile === p.name}
                      onClick={() => handleStartProfile(p.name)}
                    />
                  ))}
                </StartMenuSection>
              )}
              {hasProfiles && (
                <div className="mx-4 border-t border-[var(--border)]" />
              )}
              <StartMenuSection label="Services">
                {project.allServices.map((s) => (
                  <StartMenuItem
                    key={s.name}
                    label={s.name}
                    mono
                    running={runningServiceNames?.has(s.name)}
                    badge={s.port > 0 ? `:${s.port}` : undefined}
                    onClick={() => handleToggleServiceClick(s.name)}
                  />
                ))}
              </StartMenuSection>
            </div>
          )}
        </div>
      )}
    </>
  );

  return (
    <ActionsDnd layout={actionsLayout} onMove={handleMoveActions} renderOverlay={renderActionOverlay}>
    <div className="flex h-full flex-col">
      <div
        ref={headerRowRef}
        className={`wails-drag flex items-center gap-4 -mx-3 py-1 transition-[padding] duration-200 ${sidebarCollapsed ? "pl-[100px]" : ""}`}
      >
        {showProjectName && (
          <h1 className="shrink-0 text-xl font-semibold tracking-tight pr-2">
            {project.name}
          </h1>
        )}
        <div ref={innerContainerRef} className="flex min-w-0 flex-1 items-center justify-end gap-2">
          {!actionsWrapped && actionsNode}
          {controlsNode}
        </div>
      </div>
      {actionsWrapped && hasActions && (
        <div
          className={`wails-drag -mx-3 mt-2 pb-1 transition-[padding] duration-200 ${sidebarCollapsed ? "pl-[100px]" : ""}`}
        >
          {actionsNode}
        </div>
      )}

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
              <h3 className="text-sm font-medium text-[var(--text-primary)]">No active terminals</h3>
              <p className="text-xs text-[var(--text-muted)]">
                Open a terminal to start working on {project.name}, or edit the project config.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleNewTerminal}
                className="flex items-center gap-2 rounded-lg bg-[var(--text-primary)] px-4 py-2 text-xs font-medium text-[var(--bg-primary)] transition-all hover:opacity-85"
              >
                <TerminalIcon />
                New Terminal
                <kbd className="ml-1 text-[10px] opacity-70">⌘T</kbd>
              </button>
              <button
                onClick={() => switchDetailView("config")}
                className="flex items-center gap-2 rounded-lg border border-[var(--border)] px-4 py-2 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
              >
                <PencilIcon />
                Edit Config
                <kbd className="ml-1 text-[10px] opacity-70">⌘E</kbd>
              </button>
            </div>
          </div>
        </div>
      )}
      <div
        className={detailView === "terminal" && !showEmptyState ? "relative mt-1.5 -mx-6 -mb-6 flex min-h-0 flex-1 flex-col overflow-hidden" : "hidden"}
        style={terminalThemeStyle}
      >
        <TerminalView
          ref={terminalViewRef}
          projectName={project.name}
          services={project.running ? project.services : EMPTY_SERVICES}
          terminalTheme={termTheme}
          onTerminalCountChange={setTerminalCount}
          fontSize={fontSize}
          onZoomIn={zoomIn}
          onZoomOut={zoomOut}
          runningPaneIDs={runningPaneIDs}
          donePaneIDs={donePaneIDs}
          waitingPaneIDs={waitingPaneIDs}
          errorPaneIDs={errorPaneIDs}
          visible={visible && detailView === "terminal" && !showEmptyState}
        />
        <TerminalFooter
          projectPath={project.root}
          actions={footerActions}
          actionIds={footerIds}
          onRunAction={handleRunAction}
          disabled={runningAction !== null}
        />
      </div>
      {detailView === "config" && (
        <div className="mt-1.5 -mx-6 -mb-6 flex flex-1 flex-col overflow-hidden">
          <ConfigEditor
            projectName={project.name}
            onSaved={onRefresh}
            onBack={() => switchDetailView("terminal")}
            onToggleView={() => switchDetailView("terminal")}
          />
        </div>
      )}
      {detailView === "notes" && (
        <div className="mt-1.5 -mx-6 -mb-6 flex min-h-0 flex-1 flex-col overflow-hidden">
          <NotesView
            projectName={project.name}
            visible={visible && detailView === "notes"}
          />
        </div>
      )}

      <ConfirmDialog
        open={confirmAction !== null}
        body={
          <>
            Run <span className="font-medium text-[var(--text-primary)]">{confirmAction?.label}</span>?
          </>
        }
        confirmLabel="Run"
        onCancel={() => { setConfirmAction(null); setPendingInputValues(null); }}
        onConfirm={() => confirmAction && executeAction(confirmAction, pendingInputValues ?? undefined)}
      />

      {inputsAction && (
        <ActionInputsModal
          action={inputsAction}
          onCancel={() => setInputsAction(null)}
          onSubmit={handleInputsSubmit}
        />
      )}

      {runningAction && (
        <ActionTerminal
          label={runningAction.label}
          onClose={() => { setRunningAction(null); setShowQuickMenu(false); }}
        />
      )}

      <TerminalSettingsModal
        open={showTerminalSettings}
        onClose={() => setShowTerminalSettings(false)}
        fontSize={fontSize}
        onZoomIn={zoomIn}
        onZoomOut={zoomOut}
        terminalTheme={termTheme}
        onTerminalThemeChange={handleTerminalThemeChange}
      />

      <ConfirmDialog
        open={confirmRemove}
        title="Remove project"
        body={
          <>
            Are you sure you want to remove{" "}
            <span className="font-medium text-[var(--text-primary)]">
              {project.name}
            </span>
            ? This will delete the config file and stop any running session.
          </>
        }
        confirmLabel="Remove"
        variant="destructive"
        disabled={loading}
        onCancel={() => setConfirmRemove(false)}
        onConfirm={async () => {
          await onRemove(project.name);
          setConfirmRemove(false);
        }}
      />
    </div>
    </ActionsDnd>
  );
}

function StartMenuSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="pt-2 pb-1.5">
      <div className="px-4 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
        {label}
      </div>
      {children}
    </div>
  );
}

function StartMenuItem({
  label,
  active,
  running,
  mono,
  badge,
  onClick,
}: {
  label: string;
  active?: boolean;
  running?: boolean;
  mono?: boolean;
  badge?: string;
  onClick: () => void;
}) {
  const highlight = active || running;
  return (
    <button
      onClick={onClick}
      className={`group flex w-full items-center gap-2.5 px-4 py-2 text-left text-[13px] transition-colors hover:bg-[var(--bg-hover)] ${
        highlight ? "text-[var(--text-primary)] font-medium" : "text-[var(--text-secondary)]"
      }`}
    >
      <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center">
        {running ? (
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent-green)]" />
        ) : active ? (
          <span className="text-[var(--accent-green)]"><CheckIcon /></span>
        ) : null}
      </span>
      <span className={`flex-1 truncate ${mono ? "font-mono" : ""}`}>{label}</span>
      {badge && <span className="text-[11px] text-[var(--text-muted)] tabular-nums">{badge}</span>}
      <HoverRunIcon running={running} />
    </button>
  );
}

function ProfileMenuItem({
  profile,
  running,
  onClick,
}: {
  profile: ProfileInfo;
  running?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`group flex w-full items-start gap-2.5 px-4 py-2.5 text-left transition-colors hover:bg-[var(--bg-hover)] ${
        running ? "text-[var(--text-primary)]" : "text-[var(--text-secondary)]"
      }`}
    >
      <span className="mt-[6px] flex h-3.5 w-3.5 shrink-0 items-center justify-center">
        {running ? (
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent-green)]" />
        ) : null}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className={`truncate text-[13px] ${running ? "font-medium" : ""}`}>
          {profile.name}
        </span>
        <span className="truncate text-[11px] text-[var(--text-muted)] font-mono">
          {profile.services.join(" · ")}
        </span>
      </span>
      <span className="mt-[6px]">
        <HoverRunIcon running={running} />
      </span>
    </button>
  );
}

function HoverRunIcon({ running }: { running?: boolean }) {
  return (
    <span className="opacity-0 transition-opacity group-hover:opacity-60 text-[var(--text-muted)]">
      {running ? <StopIcon /> : <PlayIcon />}
    </span>
  );
}

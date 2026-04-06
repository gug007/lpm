import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { ActionButton } from "./ActionButton";
import { OpenInDropdown } from "./OpenInDropdown";
import { BranchSwitcher } from "./BranchSwitcher";
import { TerminalView, type TerminalViewHandle } from "./TerminalView";
import { ConfigEditor } from "./ConfigEditor";
import { RunAction } from "../../wailsjs/go/main/App";
import { getSettings, saveSettings } from "../settings";
import { getProjectTerminals, saveProjectTerminals } from "../terminals";
import { type TerminalThemeName, terminalThemeNames } from "../terminal-themes";
import type { ProjectInfo, ActionInfo, TerminalConfigInfo } from "../types";
import { TerminalIcon, CheckIcon, ChevronDownIcon, PencilIcon, MenuIcon } from "./icons";
import { ConfirmDialog } from "./ui/ConfirmDialog";
import { useOutsideClick } from "../hooks/useOutsideClick";
import { ActionTerminal } from "./project-detail/ActionTerminal";
import { QuickPopover } from "./project-detail/QuickPopover";

const EMPTY_SERVICES: { name: string }[] = [];

interface ProjectDetailProps {
  project: ProjectInfo;
  visible?: boolean;
  sidebarCollapsed?: boolean;
  onStart: (name: string, profile: string) => Promise<void>;
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
  onStop,
  onRestart,
  onRefresh,
  onRemove,
}: ProjectDetailProps) {
  const [loading, setLoading] = useState(false);
  const [activeProfile, setActiveProfile] = useState(
    project.activeProfile || project.profiles?.[0] || ""
  );
  useEffect(() => {
    if (project.activeProfile) setActiveProfile(project.activeProfile);
  }, [project.activeProfile]);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [showQuickMenu, setShowQuickMenu] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const profileMenuRef = useOutsideClick<HTMLDivElement>(
    () => setShowProfileMenu(false),
    showProfileMenu,
  );

  const saved = getSettings().terminalTheme;
  const [termTheme, setTermTheme] = useState<TerminalThemeName>(
    saved && terminalThemeNames.includes(saved as TerminalThemeName) ? saved as TerminalThemeName : "default"
  );

  const handleTerminalThemeChange = (theme: TerminalThemeName) => {
    setTermTheme(theme);
    const s = getSettings();
    saveSettings({ ...s, terminalTheme: theme === "default" ? undefined : theme });
  };

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

  const terminalViewRef = useRef<TerminalViewHandle>(null);

  const buttonActions = (project.actions ?? []).filter((a) => a.display === "button");
  const menuActions = (project.actions ?? []).filter((a) => a.display !== "button");
  const buttonTerminals = (project.terminals ?? []).filter((t) => t.display === "button");
  const menuTerminals = (project.terminals ?? []).filter((t) => t.display !== "button");

  const [runningAction, setRunningAction] = useState<ActionInfo | null>(null);
  const [confirmAction, setConfirmAction] = useState<ActionInfo | null>(null);

  const handleRunAction = (action: ActionInfo) => {
    if (action.confirm) {
      setConfirmAction(action);
      return;
    }
    executeAction(action);
  };

  const executeAction = async (action: ActionInfo) => {
    setConfirmAction(null);
    try {
      await RunAction(project.name, action.name);
      setRunningAction(action);
    } catch (err) {
      toast.error(`${action.label}: ${err}`);
    }
  };

  const hasProfiles = project.profiles && project.profiles.length > 0;
  const [detailView, setDetailView] = useState<"terminal" | "config">(() => {
    const saved = getProjectTerminals(project.name).detailView;
    return saved === "config" ? "config" : "terminal";
  });

  const [terminalCount, setTerminalCount] = useState(() => {
    const saved = getProjectTerminals(project.name).terminals;
    return saved?.length ?? 0;
  });
  const showEmptyState = !project.running && detailView === "terminal" && terminalCount === 0;

  const switchDetailView = (view: "terminal" | "config") => {
    setDetailView(view);
    const state = getProjectTerminals(project.name);
    saveProjectTerminals(project.name, { ...state, detailView: view });
  };

  const handleNewTerminal = () => {
    switchDetailView("terminal");
    terminalViewRef.current?.createTerminal();
  };

  const handleRunTerminal = async (term: TerminalConfigInfo) => {
    switchDetailView("terminal");
    try {
      await terminalViewRef.current?.createTerminalWithCmd(term.label, term.name, term.cmd);
    } catch (err) {
      toast.error(`${term.label}: ${err}`);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className={`wails-drag flex items-center gap-4 -mx-3 py-1 transition-[padding] duration-200 ${sidebarCollapsed ? "pl-[100px]" : ""}`}>
        <h1 className="shrink-0 text-xl font-semibold tracking-tight">
          {project.name}
        </h1>
        <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
          {(buttonActions.length > 0 || buttonTerminals.length > 0) && (
            <div className="flex min-w-0 items-center gap-2 overflow-x-auto" style={{ "--wails-draggable": "no-drag" } as React.CSSProperties}>
              {buttonActions.map((action) => (
                <ActionButton
                  key={action.name}
                  onClick={() => handleRunAction(action)}
                  disabled={runningAction !== null}
                  variant="secondary"
                  label={action.label}
                />
              ))}
              {buttonTerminals.map((term) => (
                <ActionButton
                  key={term.name}
                  onClick={() => handleRunTerminal(term)}
                  disabled={false}
                  variant="secondary"
                  label={term.label}
                />
              ))}
            </div>
          )}
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
                terminals={menuTerminals}
                running={project.running}
                actionBusy={runningAction !== null}
                onClose={() => setShowQuickMenu(false)}
                onRunAction={handleRunAction}
                onRunTerminal={handleRunTerminal}
                onEditConfig={() => switchDetailView("config")}
                onRestart={() => withLoading(() => onRestart(project.name, activeProfile))}
                onRemove={() => setConfirmRemove(true)}
              />
            )}
          </div>
          {project.running ? (
            <div style={{ "--wails-draggable": "no-drag" } as React.CSSProperties}>
              <ActionButton
                onClick={() =>
                  withLoading(async () => {
                    await onStop(project.name);
                    switchDetailView("terminal");
                  })
                }
                disabled={loading}
                variant="destructive"
                label="Stop"
              />
            </div>
          ) : hasProfiles ? (
            <div ref={profileMenuRef} className="relative flex" style={{ "--wails-draggable": "no-drag" } as React.CSSProperties}>
              <button
                onClick={handleStart}
                disabled={loading}
                className="rounded-l-lg px-3.5 py-1.5 text-xs font-medium transition-all disabled:opacity-40 bg-[var(--text-primary)] text-[var(--bg-primary)] hover:opacity-85"
              >
                Start
              </button>
              <button
                onClick={() => { setShowQuickMenu(false); setShowProfileMenu((v) => !v); }}
                disabled={loading}
                className="rounded-r-lg border-l border-[var(--bg-primary)]/20 px-1.5 py-1.5 transition-all disabled:opacity-40 bg-[var(--text-primary)] text-[var(--bg-primary)] hover:opacity-85"
              >
                <ChevronDownIcon />
              </button>
              {showProfileMenu && (
                <div className="absolute right-0 top-full z-50 mt-1 min-w-[140px] rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] py-1 shadow-lg">
                  {project.profiles.map((p) => (
                    <button
                      key={p}
                      onClick={() => {
                        setActiveProfile(p);
                        setShowProfileMenu(false);
                      }}
                      className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] transition-colors hover:bg-[var(--bg-hover)] ${
                        activeProfile === p
                          ? "text-[var(--text-primary)] font-medium"
                          : "text-[var(--text-secondary)]"
                      }`}
                    >
                      <span className="flex-1">{p}</span>
                      {activeProfile === p && (
                        <span className="text-[var(--accent-green)]"><CheckIcon /></span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div style={{ "--wails-draggable": "no-drag" } as React.CSSProperties}>
              <ActionButton
                onClick={handleStart}
                disabled={loading}
                variant="primary"
                label="Start"
              />
            </div>
          )}
        </div>
      </div>

      {showEmptyState && (
        <div className="mt-1.5 -mx-6 -mb-6 flex min-h-0 flex-1 flex-col items-center justify-center overflow-hidden">
          <div className="flex flex-col items-center gap-4">
            <p className="text-sm text-[var(--text-muted)]">No active terminals</p>
            <div className="flex items-center gap-3">
              <button
                onClick={handleNewTerminal}
                className="flex items-center gap-2 rounded-lg bg-[var(--text-primary)] px-4 py-2 text-xs font-medium text-[var(--bg-primary)] transition-all hover:opacity-85"
              >
                <TerminalIcon />
                New Terminal
              </button>
              <button
                onClick={() => switchDetailView("config")}
                className="flex items-center gap-2 rounded-lg border border-[var(--border)] px-4 py-2 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
              >
                <PencilIcon />
                Edit Config
              </button>
            </div>
          </div>
        </div>
      )}
      <div className={detailView === "terminal" && !showEmptyState ? "relative mt-1.5 -mx-6 -mb-6 flex min-h-0 flex-1 flex-col overflow-hidden" : "hidden"}>
        <TerminalView
          ref={terminalViewRef}
          projectName={project.name}
          services={project.running ? project.services : EMPTY_SERVICES}
          terminalTheme={termTheme}
          onTerminalThemeChange={handleTerminalThemeChange}
          onTerminalCountChange={setTerminalCount}
          runningPaneIDs={new Set(project.statusEntries?.filter(e => e.value === "Running" && e.paneID).map(e => e.paneID!))}
          donePaneIDs={new Set(project.statusEntries?.filter(e => e.value === "Done" && e.paneID).map(e => e.paneID!))}
          visible={visible && detailView === "terminal" && !showEmptyState}
        />
        <div className="pointer-events-none absolute bottom-3 right-3 z-20">
          <div className="pointer-events-auto">
            <BranchSwitcher projectPath={project.root} />
          </div>
        </div>
      </div>
      {detailView === "config" && (
        <div className="mt-1.5 -mx-6 -mb-6 flex flex-1 flex-col overflow-hidden">
          <ConfigEditor
            projectName={project.name}
            onSaved={onRefresh}
            onBack={() => switchDetailView("terminal")}
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
        onCancel={() => setConfirmAction(null)}
        onConfirm={() => confirmAction && executeAction(confirmAction)}
      />

      {runningAction && (
        <ActionTerminal
          label={runningAction.label}
          onClose={() => { setRunningAction(null); setShowQuickMenu(false); }}
        />
      )}

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
  );
}

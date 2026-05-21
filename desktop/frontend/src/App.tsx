import { useEffect } from "react";
import { Sidebar } from "./components/Sidebar";
import { ProjectDetail } from "./components/ProjectDetail";
import { Settings } from "./components/Settings";
import { GlobalConfigEditor } from "./components/GlobalConfigEditor";
import { TemplateEditor } from "./components/TemplateEditor";
import { CommitInstructionsEditor } from "./components/CommitInstructionsEditor";
import { PRInstructionsEditor } from "./components/PRInstructionsEditor";
import { BranchNameInstructionsEditor } from "./components/BranchNameInstructionsEditor";
import { EmptyState, EmptyStateNoProjects } from "./components/EmptyState";
import { TmuxInstaller } from "./components/TmuxInstaller";
import { FeedbackModal } from "./components/FeedbackModal";
import { NewProjectPicker } from "./components/NewProjectPicker";
import { AddSSHProjectModal } from "./components/AddSSHProjectModal";
import { AddCloneRepoModal } from "./components/AddCloneRepoModal";
import { PortConflictDialog } from "./components/PortConflictDialog";
import { FileViewerHost } from "./components/FileViewerHost";
import { TerminalDropOverlayHost } from "./components/terminal/TerminalDropOverlayHost";
import { Toaster } from "sonner";
import { SidebarIcon } from "./components/icons";
import { useWindowResizeSaver } from "./hooks/useWindowResizeSaver";
import { useKeyboardShortcut } from "./hooks/useKeyboardShortcut";
import { useProjectsSync } from "./hooks/useProjectsSync";
import { useAppEvents } from "./hooks/useAppEvents";
import { useProjectWatcher } from "./hooks/useProjectWatcher";
import { getSettings, saveSettings } from "./store/settings";
import { useAppStore } from "./store/app";

import { InstallTmux, TmuxInstalled } from "../wailsjs/go/main/App";

export default function App() {
  const projects = useAppStore((s) => s.projects);
  const selected = useAppStore((s) => s.selected);
  const view = useAppStore((s) => s.view);
  const sidebarCollapsed = useAppStore((s) => s.sidebarCollapsed);
  const tmuxReady = useAppStore((s) => s.tmuxReady);
  const visited = useAppStore((s) => s.visited);
  const detached = useAppStore((s) => s.detached);
  const duplicatingName = useAppStore((s) => s.duplicatingName);
  const removingName = useAppStore((s) => s.removingName);
  const selectedTemplate = useAppStore((s) => s.selectedTemplate);

  const setView = useAppStore((s) => s.setView);
  const setSidebarCollapsed = useAppStore((s) => s.setSidebarCollapsed);
  const setFeedbackOpen = useAppStore((s) => s.setFeedbackOpen);
  const setTmuxReady = useAppStore((s) => s.setTmuxReady);
  const selectProject = useAppStore((s) => s.selectProject);
  const clearSelection = useAppStore((s) => s.clearSelection);
  const markVisited = useAppStore((s) => s.markVisited);
  const pruneVisitedToProjects = useAppStore((s) => s.pruneVisitedToProjects);
  const startProject = useAppStore((s) => s.startProject);
  const stopProject = useAppStore((s) => s.stopProject);
  const restartProject = useAppStore((s) => s.restartProject);
  const toggleProjectRunning = useAppStore((s) => s.toggleProjectRunning);
  const toggleService = useAppStore((s) => s.toggleService);
  const addProject = useAppStore((s) => s.addProject);
  const duplicateProject = useAppStore((s) => s.duplicateProject);
  const removeProject = useAppStore((s) => s.removeProject);
  const renameProject = useAppStore((s) => s.renameProject);
  const reorderProjects = useAppStore((s) => s.reorderProjects);
  const detachProject = useAppStore((s) => s.detachProject);
  const attachProject = useAppStore((s) => s.attachProject);
  const focusDetachedProject = useAppStore((s) => s.focusDetachedProject);
  const refreshAfterRename = useAppStore((s) => s.refreshAfterRename);

  const handleSelect = async (name: string) => {
    // Race guard: if the window closed between sidebar paint and click,
    // fall back to in-pane selection instead of swallowing the click.
    if (detached.has(name) && (await focusDetachedProject(name))) return;
    selectProject(name);
  };

  const isSettingsView = view !== "projects";
  const selectedProject = projects.find((p) => p.name === selected) || null;

  useProjectsSync();
  useAppEvents();
  useWindowResizeSaver();

  useEffect(() => {
    TmuxInstalled().then(setTmuxReady);
  }, [setTmuxReady]);

  useKeyboardShortcut({ key: "b", meta: true }, () => {
    setSidebarCollapsed((v) => !v);
  });

  useKeyboardShortcut(
    Array.from({ length: 9 }, (_, i) => ({ key: String(i + 1), meta: true })),
    (_e, matched) => {
      const project = projects[Number(matched.key) - 1];
      if (project) selectProject(project.name);
    },
  );

  // Drop a stale saved selection if the project was deleted while lpm was
  // closed, but only once projects has actually loaded — otherwise the
  // empty initial array would clear a valid selection on every boot.
  useEffect(() => {
    if (selected && projects.length > 0 && !projects.some((p) => p.name === selected)) {
      clearSelection();
    }
  }, [projects, selected, clearSelection]);

  useEffect(() => {
    const next = selected ?? undefined;
    if (getSettings().lastSelectedProject !== next) {
      saveSettings({ lastSelectedProject: next });
    }
  }, [selected]);

  useProjectWatcher(view === "projects" ? selectedProject?.root : null);

  useEffect(() => {
    if (selected) markVisited(selected);
  }, [selected, markVisited]);

  useEffect(() => {
    // Wait for projects to actually load before pruning — otherwise the
    // empty initial array would wipe any freshly-marked visited entry
    // (e.g., the project just auto-selected on cold boot), causing the
    // next switch-away to unmount it and drop its terminal tree.
    if (projects.length > 0) pruneVisitedToProjects();
  }, [projects, pruneVisitedToProjects]);

  // Hide detached projects from main-window content — their detail view
  // lives in their own window, and rendering it inline too would duplicate
  // terminal mounts and steal focus from the detached webview.
  const visitedProjects = projects.filter(
    (p) =>
      !detached.has(p.name) && (p.name === selected || visited.has(p.name)),
  );

  if (tmuxReady === null) {
    return (
      <div className="flex h-screen bg-[var(--bg-primary)]">
        <div className="wails-drag absolute inset-x-0 top-0 h-10" />
      </div>
    );
  }

  if (tmuxReady === false) {
    return (
      <TmuxInstaller
        installTmux={InstallTmux}
        onInstalled={() => setTmuxReady(true)}
      />
    );
  }

  return (
    <div className="flex h-screen">
      <Toaster
        position="top-right"
        theme="system"
        offset={56}
        closeButton
        richColors
        toastOptions={{ duration: 5000 }}
      />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          projects={projects}
          selected={view === "projects" ? selected : null}
          collapsed={sidebarCollapsed}
          onCollapsedChange={setSidebarCollapsed}
          onSelect={handleSelect}
          onToggle={toggleProjectRunning}
          onSettings={() => setView("settings")}
          onFeedback={() => setFeedbackOpen(true)}
          onAddProject={addProject}
          onDuplicateProject={duplicateProject}
          onRemoveProject={removeProject}
          onRenameProject={renameProject}
          onReorder={reorderProjects}
          onDetachProject={detachProject}
          onAttachProject={attachProject}
          detached={detached}
          showSettings={isSettingsView}
          duplicatingName={duplicatingName}
          removingName={removingName}
        />
        <main className="flex flex-1 flex-col overflow-hidden bg-[var(--bg-primary)] px-6 pb-6">
          <div className="wails-drag flex h-2 shrink-0 items-center">
            {sidebarCollapsed && (
              <button
                onClick={() => setSidebarCollapsed(false)}
                style={
                  { "--wails-draggable": "no-drag" } as React.CSSProperties
                }
                className="absolute left-[85px] top-[16px] z-10 flex h-5 w-5 items-center justify-center rounded text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                title="Expand sidebar (⌘B)"
              >
                <SidebarIcon />
              </button>
            )}
          </div>
          {view === "settings" && <Settings onNavigate={setView} />}
          {view === "global-config" && (
            <GlobalConfigEditor onBack={() => setView("settings")} />
          )}
          {view === "commit-instructions" && (
            <CommitInstructionsEditor onBack={() => setView("settings")} />
          )}
          {view === "pr-instructions" && (
            <PRInstructionsEditor onBack={() => setView("settings")} />
          )}
          {view === "branch-instructions" && (
            <BranchNameInstructionsEditor onBack={() => setView("settings")} />
          )}
          {view === "template" && selectedTemplate && (
            <TemplateEditor
              key={selectedTemplate}
              name={selectedTemplate}
              onBack={() => setView("settings")}
            />
          )}
          {visitedProjects.map((project) => {
            const isSelected = view === "projects" && selected === project.name;
            return (
              <div
                key={project.name}
                className={
                  isSelected ? "flex min-h-0 flex-1 flex-col" : "hidden"
                }
              >
                <ProjectDetail
                  project={project}
                  visible={isSelected}
                  sidebarCollapsed={sidebarCollapsed}
                  onStart={startProject}
                  onToggleService={toggleService}
                  onStop={stopProject}
                  onRestart={restartProject}
                  onRefresh={refreshAfterRename}
                  onRemove={removeProject}
                />
              </div>
            );
          })}
          {view === "projects" && !selectedProject && projects.length === 0 && (
            <EmptyStateNoProjects onAdd={addProject} />
          )}
          {view === "projects" && !selectedProject && projects.length > 0 && (
            <EmptyState />
          )}
        </main>
      </div>
      <FeedbackModal />
      <NewProjectPicker />
      <AddSSHProjectModal />
      <AddCloneRepoModal />
      <PortConflictDialog />
      <FileViewerHost />
      <TerminalDropOverlayHost />
    </div>
  );
}

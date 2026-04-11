import { useEffect } from "react";
import { Sidebar } from "./components/Sidebar";
import { ProjectDetail } from "./components/ProjectDetail";
import { Settings } from "./components/Settings";
import { GlobalConfigEditor } from "./components/GlobalConfigEditor";
import { CommitInstructionsEditor } from "./components/CommitInstructionsEditor";
import { PRInstructionsEditor } from "./components/PRInstructionsEditor";
import { EmptyState, EmptyStateNoProjects } from "./components/EmptyState";
import { TmuxInstaller } from "./components/TmuxInstaller";
import { FeedbackModal } from "./components/FeedbackModal";
import { Toaster } from "sonner";
import { SidebarIcon } from "./components/icons";
import { useWindowResizeSaver } from "./hooks/useWindowResizeSaver";
import { useKeyboardShortcut } from "./hooks/useKeyboardShortcut";
import { useProjectsSync } from "./hooks/useProjectsSync";
import { useAppEvents } from "./hooks/useAppEvents";
import { getSettings, saveSettings } from "./settings";
import { useAppStore } from "./store/app";

import {
  InstallTmux,
  StartWatchingProject,
  StopWatchingProject,
  TmuxInstalled,
} from "../wailsjs/go/main/App";

export default function App() {
  const projects = useAppStore((s) => s.projects);
  const selected = useAppStore((s) => s.selected);
  const view = useAppStore((s) => s.view);
  const sidebarCollapsed = useAppStore((s) => s.sidebarCollapsed);
  const feedbackOpen = useAppStore((s) => s.feedbackOpen);
  const tmuxReady = useAppStore((s) => s.tmuxReady);
  const visited = useAppStore((s) => s.visited);
  const duplicatingName = useAppStore((s) => s.duplicatingName);

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
  const reorderProjects = useAppStore((s) => s.reorderProjects);
  const refreshAfterRename = useAppStore((s) => s.refreshAfterRename);

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

  useEffect(() => {
    const root = view === "projects" ? selectedProject?.root : null;
    if (!root) {
      StopWatchingProject().catch(() => {});
      return;
    }
    StartWatchingProject(root).catch(() => {});
    return () => {
      StopWatchingProject().catch(() => {});
    };
  }, [selectedProject?.root, view]);

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

  const visitedProjects = projects.filter(
    (p) => p.name === selected || visited.has(p.name),
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
          onSelect={selectProject}
          onToggle={toggleProjectRunning}
          onSettings={() => setView("settings")}
          onFeedback={() => setFeedbackOpen(true)}
          onAddProject={addProject}
          onDuplicateProject={duplicateProject}
          onRemoveProject={removeProject}
          onReorder={reorderProjects}
          showSettings={isSettingsView}
          duplicatingName={duplicatingName}
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
      {feedbackOpen && <FeedbackModal onClose={() => setFeedbackOpen(false)} />}
    </div>
  );
}

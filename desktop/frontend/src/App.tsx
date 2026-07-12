import { useEffect, useState } from "react";
import { Sidebar } from "./components/Sidebar";
import { ProjectDetail } from "./components/ProjectDetail";
import { GlobalTerminalsView } from "./components/GlobalTerminalsView";
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
import { MainTopBar } from "./components/MainTopBar";
import { useIsFullscreen } from "./hooks/useIsFullscreen";
import { useKeyboardShortcut } from "./hooks/useKeyboardShortcut";
import { useProjectsSync } from "./hooks/useProjectsSync";
import { useAppEvents } from "./hooks/useAppEvents";
import { useProjectWatcher } from "./hooks/useProjectWatcher";
import { getSettings, saveSettings } from "./store/settings";
import { useAppStore } from "./store/app";
import { onRunInDuplicates } from "./mirror";

import { InstallTmux, TmuxInstalled } from "../bridge/commands";

export default function App() {
  const projects = useAppStore((s) => s.projects);
  const groups = useAppStore((s) => s.groups);
  const sidebarOrder = useAppStore((s) => s.sidebarOrder);
  const selected = useAppStore((s) => s.selected);
  const view = useAppStore((s) => s.view);
  const sidebarCollapsed = useAppStore((s) => s.sidebarCollapsed);
  const tmuxReady = useAppStore((s) => s.tmuxReady);
  const visited = useAppStore((s) => s.visited);
  const detached = useAppStore((s) => s.detached);
  const duplicatingNames = useAppStore((s) => s.duplicatingNames);
  const removingNames = useAppStore((s) => s.removingNames);
  const selectedTemplate = useAppStore((s) => s.selectedTemplate);

  const setView = useAppStore((s) => s.setView);
  const setSidebarCollapsed = useAppStore((s) => s.setSidebarCollapsed);
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
  const bulkDuplicate = useAppStore((s) => s.bulkDuplicate);
  const removeProject = useAppStore((s) => s.removeProject);
  const removeProjectCascade = useAppStore((s) => s.removeProjectCascade);
  const removeProjectFromDisk = useAppStore((s) => s.removeProjectFromDisk);
  const removeProjectsBatch = useAppStore((s) => s.removeProjectsBatch);
  const renameProject = useAppStore((s) => s.renameProject);
  const moveProjectRoot = useAppStore((s) => s.moveProjectRoot);
  const applySidebarLayout = useAppStore((s) => s.applySidebarLayout);
  const createGroup = useAppStore((s) => s.createGroup);
  const renameGroup = useAppStore((s) => s.renameGroup);
  const deleteGroup = useAppStore((s) => s.deleteGroup);
  const toggleGroupCollapsed = useAppStore((s) => s.toggleGroupCollapsed);
  const moveProjectToGroup = useAppStore((s) => s.moveProjectToGroup);
  const moveProjectsToGroup = useAppStore((s) => s.moveProjectsToGroup);
  const detachProject = useAppStore((s) => s.detachProject);
  const attachProject = useAppStore((s) => s.attachProject);
  const refreshAfterRename = useAppStore((s) => s.refreshAfterRename);

  const handleSelect = (name: string) => {
    // The main window owns every project's terminals, including detached ones
    // (mirrored into their own window). Clicking a detached project shows it
    // inline here rather than redirecting to its window — it's live in both.
    selectProject(name);
  };

  const isTerminalsView = view === "terminals";
  const isSettingsView = view !== "projects" && view !== "terminals";
  const selectedProject = projects.find((p) => p.name === selected) || null;

  const [globalTerminalsVisited, setGlobalTerminalsVisited] = useState(false);
  useEffect(() => {
    if (isTerminalsView) setGlobalTerminalsVisited(true);
  }, [isTerminalsView]);

  useProjectsSync();
  useAppEvents();
  const isFullscreen = useIsFullscreen();

  // A mirror (detached) window can trigger run-in-duplicates but can't create
  // the copies itself — they mount and auto-run in this main window's store.
  useEffect(
    () =>
      onRunInDuplicates((p) =>
        bulkDuplicate(
          p.project,
          p.count,
          p.opts as Parameters<typeof bulkDuplicate>[2],
        ),
      ),
    [bulkDuplicate],
  );

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

  // The main window owns every project's terminals, so a detached project stays
  // mounted here (its detached window is a mirror that adopts these live PTYs).
  // Detached projects are always kept mounted — even when not selected — so the
  // owner exists for the mirror to attach to (e.g. a window restored at launch).
  const visitedProjects = projects.filter(
    (p) => detached.has(p.name) || p.name === selected || visited.has(p.name),
  );

  if (tmuxReady === null) {
    return (
      <div className="flex h-screen bg-[var(--bg-primary)]">
        <div className="app-drag absolute inset-x-0 top-0 h-10" />
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
          groups={groups}
          sidebarOrder={sidebarOrder}
          selected={view === "projects" ? selected : null}
          collapsed={sidebarCollapsed}
          onCollapsedChange={setSidebarCollapsed}
          onSelect={handleSelect}
          onToggle={toggleProjectRunning}
          onTerminals={() => setView("terminals")}
          onSettings={() => setView("settings")}
          onAddProject={addProject}
          onBulkDuplicate={bulkDuplicate}
          onRemoveProject={removeProject}
          onRemoveProjectCascade={removeProjectCascade}
          onRemoveProjectFromDisk={removeProjectFromDisk}
          onRemoveProjectsBatch={removeProjectsBatch}
          onRenameProject={renameProject}
          onMoveProjectRoot={moveProjectRoot}
          onApplySidebarLayout={applySidebarLayout}
          onCreateGroup={createGroup}
          onRenameGroup={renameGroup}
          onDeleteGroup={deleteGroup}
          onToggleGroupCollapsed={toggleGroupCollapsed}
          onMoveProjectToGroup={moveProjectToGroup}
          onMoveProjectsToGroup={moveProjectsToGroup}
          onDetachProject={detachProject}
          onAttachProject={attachProject}
          detached={detached}
          showTerminals={isTerminalsView}
          showSettings={isSettingsView}
          duplicatingNames={duplicatingNames}
          removingNames={removingNames}
        />
        <main className="flex flex-1 flex-col overflow-hidden bg-[var(--bg-primary)] px-6 pb-6">
          <MainTopBar
            sidebarCollapsed={sidebarCollapsed}
            isFullscreen={isFullscreen}
            onExpand={() => setSidebarCollapsed(false)}
          />
          {globalTerminalsVisited && (
            <div
              className={
                isTerminalsView ? "flex min-h-0 flex-1 flex-col" : "hidden"
              }
            >
              <GlobalTerminalsView
                visible={isTerminalsView}
                sidebarCollapsed={sidebarCollapsed}
              />
            </div>
          )}
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

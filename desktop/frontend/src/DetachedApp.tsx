import { useEffect } from "react";
import { Toaster } from "sonner";
import { Sidebar } from "./components/Sidebar";
import { ProjectDetail } from "./components/ProjectDetail";
import { findParentProject, projectDisplayName } from "./components/ProjectNameDisplay";
import { PortConflictDialog } from "./components/PortConflictDialog";
import { FileViewerHost } from "./components/FileViewerHost";
import { TerminalDropOverlayHost } from "./components/terminal/TerminalDropOverlayHost";
import { MainTopBar } from "./components/MainTopBar";
import { useProjectsSync } from "./hooks/useProjectsSync";
import { useAmbientAppEvents } from "./hooks/useAppEvents";
import { useProjectWatcher } from "./hooks/useProjectWatcher";
import { useKeyboardShortcut } from "./hooks/useKeyboardShortcut";
import { useIsFullscreen } from "./hooks/useIsFullscreen";
import { useAppStore } from "./store/app";
import { FocusMainWindow } from "../bridge/commands";

interface DetachedAppProps {
  projectName: string;
}

export function DetachedApp({ projectName }: DetachedAppProps) {
  const projects = useAppStore((s) => s.projects);
  const groups = useAppStore((s) => s.groups);
  const sidebarOrder = useAppStore((s) => s.sidebarOrder);
  const detached = useAppStore((s) => s.detached);
  const sidebarCollapsed = useAppStore((s) => s.sidebarCollapsed);
  const duplicatingNames = useAppStore((s) => s.duplicatingNames);
  const removingNames = useAppStore((s) => s.removingNames);

  const setSidebarCollapsed = useAppStore((s) => s.setSidebarCollapsed);
  const startProject = useAppStore((s) => s.startProject);
  const stopProject = useAppStore((s) => s.stopProject);
  const restartProject = useAppStore((s) => s.restartProject);
  const toggleService = useAppStore((s) => s.toggleService);
  const toggleProjectRunning = useAppStore((s) => s.toggleProjectRunning);
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
  const focusDetachedProject = useAppStore((s) => s.focusDetachedProject);
  const refreshAfterRename = useAppStore((s) => s.refreshAfterRename);

  useProjectsSync({ mode: "detached" });
  useAmbientAppEvents();

  const project = projects.find((p) => p.name === projectName);
  useProjectWatcher(project?.root);

  const parentProject = findParentProject(project, projects);

  useEffect(() => {
    if (project) document.title = projectDisplayName(project, parentProject);
  }, [project, parentProject]);

  useKeyboardShortcut({ key: "b", meta: true }, () =>
    setSidebarCollapsed((v) => !v),
  );
  const isFullscreen = useIsFullscreen();

  const handleSelect = async (name: string) => {
    if (detached.has(name)) {
      await focusDetachedProject(name);
      return;
    }
    await FocusMainWindow(name);
  };

  if (!project) {
    return (
      <div className="flex h-screen flex-col bg-[var(--bg-primary)]">
        <div className="app-drag absolute inset-x-0 top-0 h-10" />
      </div>
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
          selected={projectName}
          collapsed={sidebarCollapsed}
          onCollapsedChange={setSidebarCollapsed}
          onSelect={handleSelect}
          onToggle={toggleProjectRunning}
          onTerminals={() => FocusMainWindow(undefined, "terminals")}
          onSettings={() => FocusMainWindow(undefined, "settings")}
          onAddProject={() => FocusMainWindow(undefined, undefined, true)}
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
          detachedSelf={projectName}
          showTerminals={false}
          showSettings={false}
          duplicatingNames={duplicatingNames}
          removingNames={removingNames}
        />
        <main className="flex flex-1 flex-col overflow-hidden bg-[var(--bg-primary)] px-6 pb-6">
          <MainTopBar
            sidebarCollapsed={sidebarCollapsed}
            isFullscreen={isFullscreen}
            onExpand={() => setSidebarCollapsed(false)}
          />
          <div className="flex min-h-0 flex-1 flex-col">
            <ProjectDetail
              project={project}
              sidebarCollapsed={sidebarCollapsed}
              onStart={startProject}
              onToggleService={toggleService}
              onStop={stopProject}
              onRestart={restartProject}
              onRefresh={refreshAfterRename}
              onRemove={removeProject}
            />
          </div>
        </main>
      </div>
      <PortConflictDialog />
      <FileViewerHost />
      <TerminalDropOverlayHost />
    </div>
  );
}

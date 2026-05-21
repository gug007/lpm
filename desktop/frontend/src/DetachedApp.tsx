import { useEffect } from "react";
import { Toaster } from "sonner";
import { ProjectDetail } from "./components/ProjectDetail";
import { PortConflictDialog } from "./components/PortConflictDialog";
import { FileViewerHost } from "./components/FileViewerHost";
import { TerminalDropOverlayHost } from "./components/terminal/TerminalDropOverlayHost";
import { useProjectsSync } from "./hooks/useProjectsSync";
import { useAmbientAppEvents } from "./hooks/useAppEvents";
import { useProjectWatcher } from "./hooks/useProjectWatcher";
import { useAppStore } from "./store/app";

interface DetachedAppProps {
  projectName: string;
}

export function DetachedApp({ projectName }: DetachedAppProps) {
  const projects = useAppStore((s) => s.projects);
  const startProject = useAppStore((s) => s.startProject);
  const stopProject = useAppStore((s) => s.stopProject);
  const restartProject = useAppStore((s) => s.restartProject);
  const toggleService = useAppStore((s) => s.toggleService);
  const removeProject = useAppStore((s) => s.removeProject);
  const refreshAfterRename = useAppStore((s) => s.refreshAfterRename);

  useProjectsSync({ mode: "detached" });
  useAmbientAppEvents();

  const project = projects.find((p) => p.name === projectName);
  useProjectWatcher(project?.root);

  useEffect(() => {
    if (project) document.title = project.label || project.name;
  }, [project]);

  if (!project) {
    return (
      <div className="flex h-screen flex-col bg-[var(--bg-primary)]">
        <div className="wails-drag absolute inset-x-0 top-0 h-10" />
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
      <main className="flex flex-1 flex-col overflow-hidden bg-[var(--bg-primary)] px-6 pb-6">
        <div className="wails-drag h-2 shrink-0" />
        <div className="flex min-h-0 flex-1 flex-col">
          <ProjectDetail
            project={project}
            sidebarCollapsed
            onStart={startProject}
            onToggleService={toggleService}
            onStop={stopProject}
            onRestart={restartProject}
            onRefresh={refreshAfterRename}
            onRemove={removeProject}
          />
        </div>
      </main>
      <PortConflictDialog />
      <FileViewerHost />
      <TerminalDropOverlayHost />
    </div>
  );
}

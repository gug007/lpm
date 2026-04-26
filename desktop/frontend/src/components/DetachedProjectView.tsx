import { useEffect } from "react";
import { Toaster } from "sonner";
import { ProjectDetail } from "./ProjectDetail";
import { EmptyState } from "./EmptyState";
import { useProjectsSync } from "../hooks/useProjectsSync";
import { useProjectWatcher } from "../hooks/useProjectWatcher";
import { useAppStore } from "../store/app";

interface Props {
  projectName: string;
}

export function DetachedProjectView({ projectName }: Props) {
  const projects = useAppStore((s) => s.projects);
  const startProject = useAppStore((s) => s.startProject);
  const stopProject = useAppStore((s) => s.stopProject);
  const restartProject = useAppStore((s) => s.restartProject);
  const toggleService = useAppStore((s) => s.toggleService);
  const removeProject = useAppStore((s) => s.removeProject);
  const refreshAfterRename = useAppStore((s) => s.refreshAfterRename);

  useProjectsSync({ poll: false });

  const project = projects.find((p) => p.name === projectName) ?? null;

  useEffect(() => {
    document.title = `lpm · ${projectName}`;
  }, [projectName]);

  useProjectWatcher(project?.root);

  if (!project) {
    return (
      <div className="flex h-screen flex-col bg-[var(--bg-primary)]">
        <div className="wails-drag h-10 shrink-0" />
        <div className="flex flex-1 items-center justify-center">
          <EmptyState />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col">
      <Toaster
        position="top-right"
        theme="system"
        offset={56}
        closeButton
        richColors
        toastOptions={{ duration: 5000 }}
      />
      <main className="flex flex-1 flex-col overflow-hidden bg-[var(--bg-primary)] px-6 pb-6">
        <div className="wails-drag flex h-2 shrink-0 items-center" />
        <div className="flex min-h-0 flex-1 flex-col">
          <ProjectDetail
            project={project}
            visible
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
    </div>
  );
}

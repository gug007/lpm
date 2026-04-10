import { useState, useEffect } from "react";
import { Sidebar } from "./components/Sidebar";
import { ProjectDetail } from "./components/ProjectDetail";
import { Settings } from "./components/Settings";
import { GlobalConfigEditor } from "./components/GlobalConfigEditor";
import { CommitInstructionsEditor } from "./components/CommitInstructionsEditor";
import { PRInstructionsEditor } from "./components/PRInstructionsEditor";
import { EmptyState, EmptyStateNoProjects } from "./components/EmptyState";
import { TmuxInstaller } from "./components/TmuxInstaller";
import { Toaster, toast } from "sonner";
import { SidebarIcon } from "./components/icons";
import { useProjectsRefresh } from "./hooks/useProjectsRefresh";
import { useWindowResizeSaver } from "./hooks/useWindowResizeSaver";
import { useKeyboardShortcut } from "./hooks/useKeyboardShortcut";
import { playDoneSound, playWaitingSound, playErrorSound } from "./sounds";
import { getSettings, saveSettings } from "./settings";

import {
  StartProject,
  StopProject,
  RemoveProject,
  BrowseFolder,
  CreateProject,
  ReorderProjects,
  TmuxInstalled,
  InstallTmux,
  StartWatchingProject,
  StopWatchingProject,
} from "../wailsjs/go/main/App";
import { EventsOn } from "../wailsjs/runtime/runtime";

export type View =
  | "projects"
  | "settings"
  | "global-config"
  | "commit-instructions"
  | "pr-instructions";

export default function App() {
  const [tmuxReady, setTmuxReady] = useState<boolean | null>(null);
  const [selected, setSelected] = useState<string | null>(() => getSettings().lastSelectedProject ?? null);
  const [view, setView] = useState<View>("projects");
  const isSettingsView = view !== "projects";
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const { projects, setProjects, refresh } = useProjectsRefresh();
  useWindowResizeSaver();

  useEffect(() => {
    TmuxInstalled().then(setTmuxReady);
  }, []);

  useKeyboardShortcut({ key: "b", meta: true }, () => {
    setSidebarCollapsed((v) => !v);
  });

  useKeyboardShortcut(
    Array.from({ length: 9 }, (_, i) => ({ key: String(i + 1), meta: true })),
    (_e, matched) => {
      const project = projects[Number(matched.key) - 1];
      if (project) handleSelect(project.name);
    },
  );

  useEffect(() => {
    const cancelDock = EventsOn("dock-project-selected", (name: string) => {
      setSelected(name);
      setView("projects");
    });
    const cancelSettings = EventsOn("menu-open-settings", () => {
      setView("settings");
    });
    const cancelCommitInstr = EventsOn("navigate-commit-instructions", () => {
      setView("commit-instructions");
    });
    const cancelPRInstr = EventsOn("navigate-pr-instructions", () => {
      setView("pr-instructions");
    });
    const cancelSound = EventsOn("play-sound", (kind: string) => {
      if (kind === "Done") playDoneSound();
      else if (kind === "Waiting") playWaitingSound();
      else if (kind === "Error") playErrorSound();
    });
    return () => {
      if (typeof cancelDock === "function") cancelDock();
      if (typeof cancelSettings === "function") cancelSettings();
      if (typeof cancelCommitInstr === "function") cancelCommitInstr();
      if (typeof cancelPRInstr === "function") cancelPRInstr();
      if (typeof cancelSound === "function") cancelSound();
    };
  }, []);

  const handleTmuxInstalled = () => setTmuxReady(true);

  const selectedProject = projects.find((p) => p.name === selected) || null;

  // Drop a stale saved selection if the project was deleted while lpm was
  // closed, but only once projects has actually loaded — otherwise the
  // empty initial array would clear a valid selection on every boot.
  useEffect(() => {
    if (selected && projects.length > 0 && !projects.some((p) => p.name === selected)) {
      setSelected(null);
    }
  }, [projects, selected]);

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

  // Track projects that have been opened so their components stay mounted.
  const [visited, setVisited] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (selected) {
      setVisited((prev) =>
        prev.has(selected) ? prev : new Set([...prev, selected]),
      );
    }
  }, [selected]);

  useEffect(() => {
    setVisited((prev) => {
      const existing = new Set(projects.map((p) => p.name));
      const next = new Set([...prev].filter((name) => existing.has(name)));
      return next.size === prev.size ? prev : next;
    });
  }, [projects]);

  const visitedProjects = projects.filter(
    (p) => p.name === selected || visited.has(p.name),
  );

  const handleStart = async (name: string, profile: string) => {
    try {
      await StartProject(name, profile);
      await refresh();
    } catch (err) {
      toast.error(`Failed to start ${name}: ${err}`);
    }
  };

  const handleStop = async (name: string) => {
    try {
      await StopProject(name);
      await refresh();
    } catch (err) {
      toast.error(`Failed to stop ${name}: ${err}`);
    }
  };

  const handleRestart = async (name: string, profile: string) => {
    try {
      await StopProject(name);
      await StartProject(name, profile);
      await refresh();
    } catch (err) {
      toast.error(`Failed to restart ${name}: ${err}`);
    }
  };

  const handleAddProject = async () => {
    try {
      const dir = await BrowseFolder();
      if (!dir) return;
      const name = dir.split("/").pop() || "new-project";
      await CreateProject(name, dir);
      await refresh();
      setSelected(name);
      setView("projects");
    } catch (err) {
      toast.error(`Failed to add project: ${err}`);
    }
  };

  const handleRefresh = async (newName?: string) => {
    await refresh();
    if (newName && newName !== selected) setSelected(newName);
  };

  const handleRemove = async (name: string) => {
    try {
      await RemoveProject(name);
      setSelected(null);
      await refresh();
    } catch (err) {
      toast.error(`Failed to remove ${name}: ${err}`);
    }
  };

  const handleSelect = (name: string) => {
    setSelected(name);
    setView("projects");
  };

  const handleToggle = async (name: string) => {
    const project = projects.find((p) => p.name === name);
    if (!project) return;
    try {
      if (project.running) {
        await StopProject(name);
      } else {
        await StartProject(name, "");
      }
      await refresh();
    } catch (err) {
      toast.error(`Failed to toggle ${name}: ${err}`);
    }
  };

  const handleReorder = async (order: string[]) => {
    const orderMap = new Map(order.map((n, i) => [n, i]));
    setProjects((prev) =>
      [...prev].sort(
        (a, b) => (orderMap.get(a.name) ?? 0) - (orderMap.get(b.name) ?? 0),
      ),
    );
    try {
      await ReorderProjects(order);
    } catch (err) {
      toast.error(`Failed to reorder: ${err}`);
    }
  };

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
        onInstalled={handleTmuxInstalled}
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
          onToggle={handleToggle}
          onSettings={() => setView("settings")}
          onAddProject={handleAddProject}
          onReorder={handleReorder}
          showSettings={isSettingsView}
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
                  onStart={handleStart}
                  onStop={handleStop}
                  onRestart={handleRestart}
                  onRefresh={handleRefresh}
                  onRemove={handleRemove}
                />
              </div>
            );
          })}
          {view === "projects" && !selectedProject && projects.length === 0 && (
            <EmptyStateNoProjects onAdd={handleAddProject} />
          )}
          {view === "projects" && !selectedProject && projects.length > 0 && (
            <EmptyState />
          )}
        </main>
      </div>
    </div>
  );
}

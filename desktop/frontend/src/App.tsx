import { useState, useEffect, useCallback, useMemo } from "react";
import { Sidebar } from "./components/Sidebar";
import { ProjectDetail } from "./components/ProjectDetail";
import { Settings } from "./components/Settings";
import { EmptyState, EmptyStateNoProjects } from "./components/EmptyState";
import { TmuxInstaller } from "./components/TmuxInstaller";
import type { ProjectInfo } from "./types";
import { SidebarIcon } from "./components/icons";

import { ListProjects, StartProject, StopProject, GetProject, RemoveProject, BrowseFolder, CreateProject, ReorderProjects, TmuxInstalled, InstallTmux, SaveWindowSize } from '../wailsjs/go/main/App';
import { EventsOn, WindowGetSize } from '../wailsjs/runtime/runtime';
const api = { ListProjects, StartProject, StopProject, GetProject, RemoveProject, BrowseFolder, CreateProject, ReorderProjects };

export default function App() {
  const [tmuxReady, setTmuxReady] = useState<boolean | null>(null);
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [view, setView] = useState<"projects" | "settings">("projects");
  const [error, setError] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    TmuxInstalled().then(setTmuxReady);
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "b") {
        e.preventDefault();
        setSidebarCollapsed((v) => !v);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const onResize = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        WindowGetSize().then(({ w, h }) => SaveWindowSize(w, h));
      }, 500);
    };
    window.addEventListener("resize", onResize);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  const handleTmuxInstalled = useCallback(() => setTmuxReady(true), []);

  const refresh = useCallback(async () => {
    try {
      const list = await api.ListProjects();
      setProjects((prev) => {
        const next = list || [];
        return JSON.stringify(prev) === JSON.stringify(next) ? prev : next;
      });
      setError(null);
    } catch (err) {
      console.error("Failed to load projects:", err);
    }
  }, []);

  useEffect(() => {
    refresh();
    let interval: ReturnType<typeof setInterval> | null = setInterval(refresh, 10_000);

    const cancelEvent = EventsOn("projects-changed", refresh);

    const onVisibility = () => {
      if (document.hidden) {
        if (interval) { clearInterval(interval); interval = null; }
      } else {
        refresh();
        if (!interval) interval = setInterval(refresh, 10_000);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      if (interval) clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
      if (typeof cancelEvent === "function") cancelEvent();
    };
  }, [refresh]);

  const selectedProject = projects.find((p) => p.name === selected) || null;

  // Track projects that have been opened so their components stay mounted
  const [visited, setVisited] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (selected) {
      setVisited((prev) => (prev.has(selected) ? prev : new Set([...prev, selected])));
    }
  }, [selected]);

  useEffect(() => {
    setVisited((prev) => {
      const existing = new Set(projects.map((p) => p.name));
      const next = new Set([...prev].filter((name) => existing.has(name)));
      return next.size === prev.size ? prev : next;
    });
  }, [projects]);

  const visitedProjects = useMemo(
    () => projects.filter((p) => p.name === selected || visited.has(p.name)),
    [projects, visited, selected],
  );

  const handleStart = async (name: string, profile: string) => {
    try {
      await api.StartProject(name, profile);
      await refresh();
    } catch (err) {
      setError(`Failed to start ${name}: ${err}`);
    }
  };

  const handleStop = async (name: string) => {
    try {
      await api.StopProject(name);
      await refresh();
    } catch (err) {
      setError(`Failed to stop ${name}: ${err}`);
    }
  };

  const handleRestart = async (name: string, profile: string) => {
    try {
      await api.StopProject(name);
      await api.StartProject(name, profile);
      await refresh();
    } catch (err) {
      setError(`Failed to restart ${name}: ${err}`);
    }
  };

  const handleAddProject = async () => {
    try {
      const dir = await api.BrowseFolder();
      if (!dir) return;
      const name = dir.split("/").pop() || "new-project";
      await api.CreateProject(name, dir);
      await refresh();
      setSelected(name);
      setView("projects");
    } catch (err) {
      setError(`Failed to add project: ${err}`);
    }
  };

  const handleRefresh = useCallback(async (newName?: string) => {
    await refresh();
    if (newName && newName !== selected) setSelected(newName);
  }, [refresh, selected]);

  const handleRemove = async (name: string) => {
    try {
      await api.RemoveProject(name);
      setSelected(null);
      await refresh();
    } catch (err) {
      setError(`Failed to remove ${name}: ${err}`);
    }
  };

  if (tmuxReady === null) {
    return <div className="flex h-screen bg-[var(--bg-primary)]"><div className="wails-drag absolute inset-x-0 top-0 h-10" /></div>;
  }

  if (tmuxReady === false) {
    return <TmuxInstaller installTmux={InstallTmux} onInstalled={handleTmuxInstalled} />;
  }

  return (
    <div className="flex h-screen">
      {error && (
        <div className="absolute left-0 right-0 top-0 z-50 bg-[var(--accent-red)] px-4 py-2 text-sm text-white">
          {error}
          <button onClick={() => setError(null)} className="ml-2 font-bold">
            ×
          </button>
        </div>
      )}
      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          projects={projects}
          selected={view === "projects" ? selected : null}
          collapsed={sidebarCollapsed}
          onCollapsedChange={setSidebarCollapsed}
          onSelect={(name) => {
            setSelected(name);
            setView("projects");
          }}
          onToggle={async (name) => {
            const project = projects.find((p) => p.name === name);
            if (!project) return;
            try {
              if (project.running) {
                await api.StopProject(name);
              } else {
                await api.StartProject(name, "");
              }
              await refresh();
            } catch (err) {
              setError(`${err}`);
            }
          }}
          onSettings={() => setView("settings")}
          onAddProject={handleAddProject}
          onReorder={async (order) => {
            const orderMap = new Map(order.map((n, i) => [n, i]));
            setProjects((prev) =>
              [...prev].sort((a, b) => (orderMap.get(a.name) ?? 0) - (orderMap.get(b.name) ?? 0))
            );
            try {
              await api.ReorderProjects(order);
            } catch (err) {
              setError(`Failed to reorder: ${err}`);
            }
          }}
          showSettings={view === "settings"}
        />
        <main className="flex flex-1 flex-col overflow-hidden bg-[var(--bg-primary)] px-6 pb-6">
          <div className="wails-drag flex h-2 shrink-0 items-center">
            {sidebarCollapsed && (
              <button
                onClick={() => setSidebarCollapsed(false)}
                style={{ "--wails-draggable": "no-drag" } as React.CSSProperties}
                className="absolute left-[85px] top-[16px] z-10 flex h-5 w-5 items-center justify-center rounded text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                title="Expand sidebar (⌘B)"
              >
                <SidebarIcon />
              </button>
            )}
          </div>
          {view === "settings" ? (
            <Settings />
          ) : (
            <>
              {visitedProjects.map((project) => {
                const isSelected = view === "projects" && selected === project.name;
                return (
                  <div key={project.name} className={isSelected ? "flex min-h-0 flex-1 flex-col" : "hidden"}>
                    <ProjectDetail
                      project={project}
                      visible={isSelected}
                      sidebarCollapsed={sidebarCollapsed}
                      onStart={handleStart}
                      onStop={handleStop}
                      onRestart={handleRestart}
                      onRefresh={handleRefresh}
                      onRemove={handleRemove}
                      onError={setError}
                    />
                  </div>
                );
              })}
              {!selectedProject && projects.length === 0 && (
                <EmptyStateNoProjects onAdd={handleAddProject} />
              )}
              {!selectedProject && projects.length > 0 && <EmptyState />}
            </>
          )}
        </main>
      </div>
    </div>
  );
}


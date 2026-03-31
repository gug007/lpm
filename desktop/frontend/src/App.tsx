import { useState, useEffect, useCallback } from "react";
import { Sidebar } from "./components/Sidebar";
import { ProjectDetail } from "./components/ProjectDetail";
import { Settings } from "./components/Settings";
import { EmptyState, EmptyStateNoProjects } from "./components/EmptyState";
import type { ProjectInfo } from "./types";

import { ListProjects, StartProject, StopProject, GetProject, RemoveProject, BrowseFolder, CreateProject, ReorderProjects } from '../wailsjs/go/main/App';
const api = { ListProjects, StartProject, StopProject, GetProject, RemoveProject, BrowseFolder, CreateProject, ReorderProjects };

export default function App() {
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [view, setView] = useState<"projects" | "settings">("projects");
  const [error, setError] = useState<string | null>(null);

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
    const interval = setInterval(refresh, 3000);
    return () => clearInterval(interval);
  }, [refresh]);

  const selectedProject = projects.find((p) => p.name === selected) || null;

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

  const handleRemove = async (name: string) => {
    try {
      await api.RemoveProject(name);
      setSelected(null);
      await refresh();
    } catch (err) {
      setError(`Failed to remove ${name}: ${err}`);
    }
  };

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
        <main className="flex flex-1 flex-col overflow-hidden bg-[var(--bg-primary)] px-6 pb-6 pt-10">
          {view === "settings" ? (
            <Settings />
          ) : selectedProject ? (
            <ProjectDetail
              key={selectedProject.name}
              project={selectedProject}
              onStart={handleStart}
              onStop={handleStop}
              onRestart={handleRestart}
              onRefresh={async (newName?: string) => {
                await refresh();
                if (newName && newName !== selected) setSelected(newName);
              }}
              onRemove={handleRemove}
            />
          ) : projects.length === 0 ? (
            <EmptyStateNoProjects onAdd={handleAddProject} />
          ) : (
            <EmptyState />
          )}
        </main>
      </div>
    </div>
  );
}


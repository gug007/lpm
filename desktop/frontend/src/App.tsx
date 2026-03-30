import { useState, useEffect, useCallback } from "react";
import { Sidebar } from "./components/Sidebar";
import { ProjectDetail } from "./components/ProjectDetail";
import { Settings } from "./components/Settings";
import type { ProjectInfo } from "./types";

import { ListProjects, StartProject, StopProject, GetProject } from '../wailsjs/go/main/App';
const api = { ListProjects, StartProject, StopProject, GetProject };

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

  return (
    <div className="flex h-screen flex-col">
      <div className="wails-drag h-8 shrink-0 border-b border-[var(--border)]" />
      {error && (
        <div className="bg-[var(--accent-red)] px-4 py-2 text-sm text-white">
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
          onSettings={() => setView("settings")}
          showSettings={view === "settings"}
        />
        <main className="flex flex-1 flex-col overflow-hidden bg-[var(--bg-primary)] p-6">
          {view === "settings" ? (
            <Settings />
          ) : selectedProject ? (
            <ProjectDetail
              key={selectedProject.name}
              project={selectedProject}
              onStart={handleStart}
              onStop={handleStop}
              onRestart={handleRestart}
              onRefresh={refresh}
            />
          ) : (
            <EmptyState />
          )}
        </main>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="text-center">
        <p className="text-2xl font-semibold text-[var(--text-primary)]">
          Select a project
        </p>
        <p className="mt-2 text-[var(--text-secondary)]">
          Choose a project from the sidebar to get started
        </p>
      </div>
    </div>
  );
}

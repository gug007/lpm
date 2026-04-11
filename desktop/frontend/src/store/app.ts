import { create } from "zustand";
import { toast } from "sonner";
import type { ProjectInfo } from "../types";
import {
  BrowseFolder,
  CreateProject,
  DuplicateProject,
  ListProjects,
  RemoveProject,
  ReorderProjects,
  StartProject,
  StopProject,
  ToggleProjectService,
} from "../../wailsjs/go/main/App";
import { getSettings } from "../settings";

export type View =
  | "projects"
  | "settings"
  | "global-config"
  | "commit-instructions"
  | "pr-instructions";

interface AppState {
  projects: ProjectInfo[];

  selected: string | null;
  view: View;
  sidebarCollapsed: boolean;
  feedbackOpen: boolean;
  tmuxReady: boolean | null;
  visited: Set<string>;
  duplicatingName: string | null;
  removingName: string | null;

  setView: (view: View) => void;
  setSidebarCollapsed: (next: boolean | ((prev: boolean) => boolean)) => void;
  setFeedbackOpen: (open: boolean) => void;
  setTmuxReady: (ready: boolean | null) => void;

  selectProject: (name: string) => void;
  clearSelection: () => void;

  markVisited: (name: string) => void;
  pruneVisitedToProjects: () => void;

  refreshProjects: () => Promise<void>;

  startProject: (name: string, profile: string) => Promise<void>;
  stopProject: (name: string) => Promise<void>;
  restartProject: (name: string, profile: string) => Promise<void>;
  toggleProjectRunning: (name: string) => Promise<void>;
  toggleService: (name: string, service: string) => Promise<void>;
  addProject: () => Promise<void>;
  duplicateProject: (name: string) => Promise<void>;
  removeProject: (name: string) => Promise<void>;
  reorderProjects: (order: string[]) => Promise<void>;
  refreshAfterRename: (newName?: string) => Promise<void>;
}

function projectsEqual(a: ProjectInfo[], b: ProjectInfo[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export const useAppStore = create<AppState>((set, get) => ({
  projects: [],

  selected: null,
  view: "projects",
  sidebarCollapsed: false,
  feedbackOpen: false,
  tmuxReady: null,
  visited: new Set<string>(),
  duplicatingName: null,
  removingName: null,

  setView: (view) => set({ view }),

  setSidebarCollapsed: (next) =>
    set((s) => ({
      sidebarCollapsed:
        typeof next === "function" ? next(s.sidebarCollapsed) : next,
    })),

  setFeedbackOpen: (feedbackOpen) => set({ feedbackOpen }),

  setTmuxReady: (tmuxReady) => set({ tmuxReady }),

  selectProject: (name) => set({ selected: name, view: "projects" }),

  clearSelection: () => set({ selected: null }),

  markVisited: (name) =>
    set((s) =>
      s.visited.has(name) ? s : { visited: new Set([...s.visited, name]) },
    ),

  pruneVisitedToProjects: () =>
    set((s) => {
      const existing = new Set(s.projects.map((p) => p.name));
      const next = new Set([...s.visited].filter((name) => existing.has(name)));
      return next.size === s.visited.size ? s : { visited: next };
    }),

  refreshProjects: async () => {
    try {
      const list = (await ListProjects()) || [];
      set((s) => (projectsEqual(s.projects, list) ? s : { projects: list }));
    } catch (err) {
      console.error("Failed to load projects:", err);
    }
  },

  startProject: async (name, profile) => {
    try {
      await StartProject(name, profile);
      await get().refreshProjects();
    } catch (err) {
      toast.error(`Failed to start ${name}: ${err}`);
    }
  },

  stopProject: async (name) => {
    try {
      await StopProject(name);
      await get().refreshProjects();
    } catch (err) {
      toast.error(`Failed to stop ${name}: ${err}`);
    }
  },

  restartProject: async (name, profile) => {
    try {
      await StopProject(name);
      await StartProject(name, profile);
      await get().refreshProjects();
    } catch (err) {
      toast.error(`Failed to restart ${name}: ${err}`);
    }
  },

  toggleProjectRunning: async (name) => {
    const project = get().projects.find((p) => p.name === name);
    if (!project) return;
    try {
      if (project.running) {
        await StopProject(name);
      } else {
        await StartProject(name, "");
      }
      await get().refreshProjects();
    } catch (err) {
      toast.error(`Failed to toggle ${name}: ${err}`);
    }
  },

  toggleService: async (name, service) => {
    try {
      await ToggleProjectService(name, service);
      await get().refreshProjects();
    } catch (err) {
      toast.error(`Failed to toggle ${service}: ${err}`);
    }
  },

  addProject: async () => {
    try {
      const dir = await BrowseFolder();
      if (!dir) return;
      const name = dir.split("/").pop() || "new-project";
      await CreateProject(name, dir);
      await get().refreshProjects();
      set({ selected: name, view: "projects" });
    } catch (err) {
      toast.error(`Failed to add project: ${err}`);
    }
  },

  duplicateProject: async (name) => {
    if (get().duplicatingName) return;
    set({ duplicatingName: name });
    try {
      const newName = await DuplicateProject(name);
      await get().refreshProjects();
      if (newName) set({ selected: newName, view: "projects" });
    } catch (err) {
      toast.error(`Failed to duplicate ${name}: ${err}`);
    } finally {
      set({ duplicatingName: null });
    }
  },

  removeProject: async (name) => {
    if (get().removingName) return;
    set({ removingName: name });
    try {
      await RemoveProject(name);
      set({ selected: null });
      await get().refreshProjects();
    } catch (err) {
      toast.error(`Failed to remove ${name}: ${err}`);
    } finally {
      set({ removingName: null });
    }
  },

  reorderProjects: async (order) => {
    const orderMap = new Map(order.map((n, i) => [n, i]));
    set((s) => ({
      projects: [...s.projects].sort(
        (a, b) => (orderMap.get(a.name) ?? 0) - (orderMap.get(b.name) ?? 0),
      ),
    }));
    try {
      await ReorderProjects(order);
    } catch (err) {
      toast.error(`Failed to reorder: ${err}`);
    }
  },

  refreshAfterRename: async (newName) => {
    await get().refreshProjects();
    if (newName && newName !== get().selected) set({ selected: newName });
  },
}));

// Called once after `loadSettings()` resolves so the store picks up the
// persisted selection before the app first renders. Keeping this out of
// the initializer lets the store module import cleanly even when
// settings haven't been loaded yet.
export function hydrateAppStore(): void {
  const last = getSettings().lastSelectedProject ?? null;
  if (useAppStore.getState().selected !== last) {
    useAppStore.setState({ selected: last });
  }
}

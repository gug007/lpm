import { create } from "zustand";
import { toast } from "sonner";
import YAML from "yaml";
import {
  isFooterDisplay,
  isHeaderDisplay,
  type ActionInfo,
  type ActionsLayout,
  type ProjectInfo,
} from "../types";
import {
  BrowseFolder,
  CreateProject,
  CreateSSHProject,
  DuplicateProject,
  ListProjects,
  ReadConfig,
  RemoveProject,
  ReorderProjects,
  SaveConfig,
  SetProjectLabel,
  StartProject,
  StopProject,
  ToggleProjectService,
} from "../../wailsjs/go/main/App";
import { getSettings } from "../settings";
import { forgetProjectTerminals } from "../terminals";
import { activeChatStorageKey } from "../components/NotesView";

export type View =
  | "projects"
  | "settings"
  | "global-config"
  | "commit-instructions"
  | "pr-instructions"
  | "branch-instructions";

export interface SSHProjectParams {
  name: string;
  host: string;
  user: string;
  port: number;
  key: string;
  dir: string;
}

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
  addProjectPickerOpen: boolean;
  sshModalOpen: boolean;
  addingSSHProject: boolean;

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
  addProject: () => void;
  closeAddProjectPicker: () => void;
  pickAddProjectKind: (kind: "local" | "ssh") => Promise<void>;
  closeSSHModal: () => void;
  addSSHProject: (params: SSHProjectParams) => Promise<void>;
  duplicateProject: (name: string, excludeUncommitted?: boolean) => Promise<void>;
  removeProject: (name: string) => Promise<void>;
  renameProject: (name: string, label: string) => Promise<void>;
  reorderProjects: (order: string[]) => Promise<void>;
  reorderActions: (projectName: string, layout: ActionsLayout) => Promise<void>;
  refreshAfterRename: (newName?: string) => Promise<void>;
}

// Mirrors the backend's sortActionNames (projects.go) so optimistic updates
// match what the next ListProjects will return.
function sortActionsByPosition(actions: ActionInfo[]): ActionInfo[] {
  return [...actions].sort((a, b) => {
    const ap = a.position;
    const bp = b.position;
    if (ap !== undefined && bp !== undefined) {
      return ap - bp || a.name.localeCompare(b.name);
    }
    if (ap !== undefined) return -1;
    if (bp !== undefined) return 1;
    return a.name.localeCompare(b.name);
  });
}

interface ActionUpdate {
  position: number;
  // undefined → leave display untouched (within-group reorder, preserves
  // legacy values like "button"). null → delete display (move to header
  // default). string → set display.
  display?: string | null;
}

// parseDocument (vs parse + stringify) keeps comments and unrelated
// formatting; shorthand string entries are widened to map form so the
// position/display fields have somewhere to attach.
async function persistActionUpdates(
  projectName: string,
  updates: Map<string, ActionUpdate>,
): Promise<void> {
  const content = await ReadConfig(projectName);
  const doc = YAML.parseDocument(content);
  const actions = doc.get("actions", true);
  if (!YAML.isMap(actions)) return;
  for (const item of actions.items) {
    if (!YAML.isScalar(item.key)) continue;
    const update = updates.get(String(item.key.value));
    if (!update) continue;
    if (YAML.isScalar(item.value) && typeof item.value.value === "string") {
      const seed: Record<string, unknown> = { cmd: item.value.value, position: update.position };
      if (typeof update.display === "string") seed.display = update.display;
      item.value = doc.createNode(seed);
    } else if (YAML.isMap(item.value)) {
      item.value.set("position", update.position);
      if (update.display === null) item.value.delete("display");
      else if (typeof update.display === "string") item.value.set("display", update.display);
    }
  }
  await SaveConfig(projectName, String(doc));
}

function buildActionUpdates(
  current: ActionInfo[],
  layout: ActionsLayout,
): Map<string, ActionUpdate> {
  const updates = new Map<string, ActionUpdate>();
  const previousGroup = new Map<string, "header" | "footer" | null>();
  for (const a of current) {
    if (isHeaderDisplay(a.display)) previousGroup.set(a.name, "header");
    else if (isFooterDisplay(a.display)) previousGroup.set(a.name, "footer");
    else previousGroup.set(a.name, null);
  }
  const visit = (keys: string[], group: "header" | "footer") => {
    keys.forEach((key, i) => {
      const update: ActionUpdate = { position: i + 1 };
      if (previousGroup.get(key) !== group) {
        update.display = group === "header" ? null : "footer";
      }
      updates.set(key, update);
    });
  };
  visit(layout.header, "header");
  visit(layout.footer, "footer");
  return updates;
}

function applyActionUpdates(
  actions: ActionInfo[],
  updates: Map<string, ActionUpdate>,
): ActionInfo[] {
  return actions.map((a) => {
    const update = updates.get(a.name);
    if (!update) return a;
    const next: ActionInfo = { ...a, position: update.position };
    if (update.display === null) next.display = "";
    else if (typeof update.display === "string") next.display = update.display;
    return next;
  });
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
  addProjectPickerOpen: false,
  sshModalOpen: false,
  addingSSHProject: false,

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

  addProject: () => set({ addProjectPickerOpen: true }),

  closeAddProjectPicker: () => set({ addProjectPickerOpen: false }),

  pickAddProjectKind: async (kind) => {
    set({ addProjectPickerOpen: false });
    if (kind === "ssh") {
      set({ sshModalOpen: true });
      return;
    }
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

  closeSSHModal: () => set({ sshModalOpen: false }),

  addSSHProject: async (params) => {
    if (get().addingSSHProject) return;
    set({ addingSSHProject: true });
    try {
      await CreateSSHProject(params.name, {
        host: params.host,
        user: params.user,
        port: params.port,
        key: params.key,
        dir: params.dir,
      });
      await get().refreshProjects();
      set({
        selected: params.name,
        view: "projects",
        sshModalOpen: false,
      });
    } catch (err) {
      toast.error(`Failed to add SSH project: ${err}`);
    } finally {
      set({ addingSSHProject: false });
    }
  },

  duplicateProject: async (name, excludeUncommitted = false) => {
    if (get().duplicatingName) return;
    set({ duplicatingName: name });
    try {
      const newName = await DuplicateProject(name, excludeUncommitted);
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
      forgetProjectTerminals(name);
      window.localStorage.removeItem(activeChatStorageKey(name));
      set({ selected: null });
      await get().refreshProjects();
    } catch (err) {
      toast.error(`Failed to remove ${name}: ${err}`);
    } finally {
      set({ removingName: null });
    }
  },

  renameProject: async (name, label) => {
    const current = get().projects.find((p) => p.name === name)?.label ?? "";
    const next = label.trim();
    if (current === next) return;
    set((s) => ({
      projects: s.projects.map((p) =>
        p.name === name ? { ...p, label: next || undefined } : p,
      ),
    }));
    try {
      await SetProjectLabel(name, next);
    } catch (err) {
      toast.error(`Failed to rename ${name}: ${err}`);
      await get().refreshProjects();
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

  reorderActions: async (projectName, layout) => {
    const project = get().projects.find((p) => p.name === projectName);
    if (!project) return;
    // Position values can collide across groups without affecting display
    // because the header/footer/menu filter runs after the sort. Display
    // is only touched when an action's group actually changed, so legacy
    // header values like "button" survive a within-group reorder.
    const updates = buildActionUpdates(project.actions ?? [], layout);

    set((s) => ({
      projects: s.projects.map((p) =>
        p.name === projectName
          ? { ...p, actions: sortActionsByPosition(applyActionUpdates(p.actions ?? [], updates)) }
          : p,
      ),
    }));

    try {
      await persistActionUpdates(projectName, updates);
    } catch (err) {
      toast.error(`Failed to save action order: ${err}`);
      await get().refreshProjects();
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

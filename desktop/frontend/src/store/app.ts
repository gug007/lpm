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
  CheckPortConflicts,
  CreateProject,
  CreateProjectFromClone,
  CreateSSHProject,
  CreateTemplate,
  DeleteTemplate,
  DuplicateProject,
  ListProjects,
  ListTemplates,
  ReadConfig,
  RemoveProject,
  RenameTemplate,
  ReorderProjects,
  ResolvePortConflict,
  SaveConfig,
  SetProjectLabel,
  StartProject,
  StopProject,
  ToggleProjectService,
} from "../../wailsjs/go/main/App";
import type { main } from "../../wailsjs/go/models";
import { getSettings } from "./settings";
import { forgetProjectTerminals } from "../terminals";
import { activeChatStorageKey } from "../components/NotesView";
import { ACTION_SECTIONS, type ActionSection } from "../actionConfig";

export type View =
  | "projects"
  | "settings"
  | "global-config"
  | "commit-instructions"
  | "pr-instructions"
  | "branch-instructions"
  | "template";

export type SettingsTab = "general" | "terminal" | "tts" | "ai" | "global-config" | "templates" | "backup";

export interface SSHProjectParams {
  name: string;
  host: string;
  user: string;
  port: number;
  key: string;
  dir: string;
}

export interface CloneProjectParams {
  name: string;
  url: string;
  branch: string;
  destParent: string;
}

export interface PortConflictPrompt {
  title: string;
  conflicts: main.PortConflictInfo[];
}

interface AppState {
  projects: ProjectInfo[];
  templates: main.TemplateInfo[];

  selected: string | null;
  selectedTemplate: string | null;
  view: View;
  settingsTab: SettingsTab;
  sidebarCollapsed: boolean;
  feedbackOpen: boolean;
  tmuxReady: boolean | null;
  visited: Set<string>;
  duplicatingName: string | null;
  removingName: string | null;
  addProjectPickerOpen: boolean;
  sshModalOpen: boolean;
  addingSSHProject: boolean;
  cloneModalOpen: boolean;
  addingCloneProject: boolean;
  portConflict: PortConflictPrompt | null;
  resolvingPortConflict: boolean;

  setView: (view: View) => void;
  setSettingsTab: (tab: SettingsTab) => void;
  setSidebarCollapsed: (next: boolean | ((prev: boolean) => boolean)) => void;
  setFeedbackOpen: (open: boolean) => void;
  setTmuxReady: (ready: boolean | null) => void;

  selectProject: (name: string) => void;
  clearSelection: () => void;

  markVisited: (name: string) => void;
  pruneVisitedToProjects: () => void;

  refreshProjects: () => Promise<void>;
  refreshTemplates: () => Promise<void>;
  selectTemplate: (name: string) => void;
  createTemplate: (name: string) => Promise<void>;
  removeTemplate: (name: string) => Promise<void>;
  renameTemplate: (oldName: string, newName: string) => Promise<void>;

  startProject: (name: string, profile: string) => Promise<void>;
  stopProject: (name: string) => Promise<void>;
  restartProject: (name: string, profile: string) => Promise<void>;
  toggleProjectRunning: (name: string) => Promise<void>;
  toggleService: (name: string, service: string) => Promise<void>;
  cancelPortConflict: () => void;
  confirmPortConflict: () => Promise<void>;
  triggerPortConflictPrompt: (
    title: string,
    conflicts: main.PortConflictInfo[],
  ) => Promise<boolean>;
  addProject: () => void;
  closeAddProjectPicker: () => void;
  pickAddProjectKind: (kind: "local" | "ssh" | "clone") => Promise<void>;
  closeSSHModal: () => void;
  addSSHProject: (params: SSHProjectParams) => Promise<void>;
  openAddCloneModal: () => void;
  closeAddCloneModal: () => void;
  addCloneProject: (params: CloneProjectParams) => Promise<void>;
  duplicateProject: (
    name: string,
    excludeUncommitted?: boolean,
  ) => Promise<void>;
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

type DisplayGroup = "header" | "footer" | null;

interface ActionUpdate {
  position: number;
  // undefined → leave display untouched (within-group reorder, preserves
  // legacy values like "button"). null → delete display (move to header
  // default). string → set display.
  display?: string | null;
  // Where to write a sparse override when the key isn't already in the
  // project YAML — derived from the resolved action's type so a global
  // terminal override lands in `terminals:`, not `actions:`.
  section: ActionSection;
}

function buildSeed(update: ActionUpdate, cmd?: string): Record<string, unknown> {
  const seed: Record<string, unknown> = { position: update.position };
  if (cmd !== undefined) seed.cmd = cmd;
  if (typeof update.display === "string") seed.display = update.display;
  return seed;
}

// parseDocument (vs parse + stringify) keeps comments and unrelated
// formatting; shorthand string entries are widened to map form so the
// position/display fields have somewhere to attach. Keys present in the
// project YAML get an in-place patch; keys that only exist in global.yml
// get a sparse override entry appended (just position + display) so other
// fields keep inheriting from global.
async function persistActionUpdates(
  projectName: string,
  updates: Map<string, ActionUpdate>,
): Promise<void> {
  const content = await ReadConfig(projectName);
  const doc = YAML.parseDocument(content || "{}");
  const remaining = new Map(updates);
  for (const section of ACTION_SECTIONS) {
    const node = doc.get(section, true);
    if (!YAML.isMap(node)) continue;
    for (const item of node.items) {
      if (!YAML.isScalar(item.key)) continue;
      const key = String(item.key.value);
      const update = remaining.get(key);
      if (!update) continue;
      if (YAML.isScalar(item.value) && typeof item.value.value === "string") {
        item.value = doc.createNode(buildSeed(update, item.value.value));
      } else if (YAML.isMap(item.value)) {
        item.value.set("position", update.position);
        if (update.display === null) item.value.delete("display");
        else if (typeof update.display === "string")
          item.value.set("display", update.display);
      }
      remaining.delete(key);
    }
  }
  for (const [key, update] of remaining) {
    let section = doc.get(update.section, true);
    if (!YAML.isMap(section)) {
      doc.set(update.section, doc.createNode({}));
      section = doc.get(update.section, true);
    }
    if (!YAML.isMap(section)) continue;
    section.set(key, buildSeed(update));
  }
  await SaveConfig(projectName, String(doc));
}

function buildActionUpdates(
  current: ActionInfo[],
  layout: ActionsLayout,
): Map<string, ActionUpdate> {
  const updates = new Map<string, ActionUpdate>();
  const previousGroup = new Map<string, DisplayGroup>();
  const sectionByKey = new Map<string, ActionSection>();
  for (const a of current) {
    if (isHeaderDisplay(a.display)) previousGroup.set(a.name, "header");
    else if (isFooterDisplay(a.display)) previousGroup.set(a.name, "footer");
    else previousGroup.set(a.name, null);
    sectionByKey.set(a.name, a.type === "terminal" ? "terminals" : "actions");
  }
  const visit = (keys: string[], group: Exclude<DisplayGroup, null>) => {
    keys.forEach((key, i) => {
      const update: ActionUpdate = {
        position: i + 1,
        section: sectionByKey.get(key) ?? "actions",
      };
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

// Held outside zustand state because functions don't belong in store
// snapshots (devtools, persistence, etc.). At most one prompt is open
// at a time, so a single slot is enough.
let resolvePortConflictPromise: ((ok: boolean) => void) | null = null;

function templatesEqual(a: main.TemplateInfo[], b: main.TemplateInfo[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].name !== b[i].name || a[i].path !== b[i].path) return false;
  }
  return true;
}

export const useAppStore = create<AppState>((set, get) => ({
  projects: [],
  templates: [],

  selected: null,
  selectedTemplate: null,
  view: "projects",
  settingsTab: "general",
  sidebarCollapsed: false,
  feedbackOpen: false,
  tmuxReady: null,
  visited: new Set<string>(),
  duplicatingName: null,
  removingName: null,
  addProjectPickerOpen: false,
  sshModalOpen: false,
  addingSSHProject: false,
  cloneModalOpen: false,
  addingCloneProject: false,
  portConflict: null,
  resolvingPortConflict: false,

  setView: (view) => set({ view }),

  setSettingsTab: (settingsTab) => set({ settingsTab }),

  setSidebarCollapsed: (next) =>
    set((s) => ({
      sidebarCollapsed:
        typeof next === "function" ? next(s.sidebarCollapsed) : next,
    })),

  setFeedbackOpen: (feedbackOpen) => set({ feedbackOpen }),

  setTmuxReady: (tmuxReady) => set({ tmuxReady }),

  selectProject: (name) => set({ selected: name, selectedTemplate: null, view: "projects" }),

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

  refreshTemplates: async () => {
    try {
      const list = (await ListTemplates()) || [];
      set((s) => (templatesEqual(s.templates, list) ? s : { templates: list }));
    } catch (err) {
      console.error("Failed to load templates:", err);
    }
  },

  selectTemplate: (name) =>
    set({ selectedTemplate: name, settingsTab: "templates", view: "template" }),

  createTemplate: async (name) => {
    try {
      await CreateTemplate(name);
      await get().refreshTemplates();
      set({ selectedTemplate: name, view: "template" });
    } catch (err) {
      toast.error(`Failed to create template: ${err}`);
      throw err;
    }
  },

  removeTemplate: async (name) => {
    try {
      await DeleteTemplate(name);
      await get().refreshTemplates();
      set((s) =>
        s.selectedTemplate === name
          ? { selectedTemplate: null, view: s.view === "template" ? "projects" : s.view }
          : s,
      );
    } catch (err) {
      toast.error(`Failed to delete template: ${err}`);
    }
  },

  renameTemplate: async (oldName, newName) => {
    if (oldName === newName) return;
    try {
      await RenameTemplate(oldName, newName);
      await get().refreshTemplates();
      set((s) =>
        s.selectedTemplate === oldName ? { selectedTemplate: newName } : s,
      );
    } catch (err) {
      toast.error(`Failed to rename template: ${err}`);
      throw err;
    }
  },

  startProject: async (name, profile) => {
    try {
      const conflicts = (await CheckPortConflicts(name, profile)) || [];
      if (conflicts.length > 0) {
        const ok = await get().triggerPortConflictPrompt(
          `Cannot start "${name}"`,
          conflicts,
        );
        if (!ok) return;
      }
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
      await get().startProject(name, profile);
    } catch (err) {
      toast.error(`Failed to restart ${name}: ${err}`);
    }
  },

  toggleProjectRunning: async (name) => {
    const project = get().projects.find((p) => p.name === name);
    if (!project) return;
    if (project.running) {
      await get().stopProject(name);
      return;
    }
    await get().startProject(name, "");
  },

  cancelPortConflict: () => {
    resolvePortConflictPromise?.(false);
    resolvePortConflictPromise = null;
    set({ portConflict: null, resolvingPortConflict: false });
  },

  confirmPortConflict: async () => {
    const prompt = get().portConflict;
    if (!prompt) return;
    set({ resolvingPortConflict: true });
    try {
      await Promise.all(prompt.conflicts.map((c) => ResolvePortConflict(c)));
      set({ portConflict: null, resolvingPortConflict: false });
      resolvePortConflictPromise?.(true);
      resolvePortConflictPromise = null;
    } catch (err) {
      set({ resolvingPortConflict: false });
      toast.error(`Failed to free port: ${err}`);
    }
  },

  triggerPortConflictPrompt: (title, conflicts) =>
    new Promise<boolean>((resolve) => {
      resolvePortConflictPromise?.(false);
      resolvePortConflictPromise = resolve;
      set({ portConflict: { title, conflicts } });
    }),

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
    if (kind === "clone") {
      set({ cloneModalOpen: true });
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

  openAddCloneModal: () => set({ cloneModalOpen: true }),

  closeAddCloneModal: () => set({ cloneModalOpen: false }),

  addCloneProject: async (params) => {
    if (get().addingCloneProject) return;
    const name = params.name.trim();
    const url = params.url.trim();
    const branch = params.branch.trim();
    const destParent = params.destParent.trim();
    if (!name || !url || !destParent) {
      throw new Error(
        "Repository URL, destination, and project name are required.",
      );
    }
    set({ addingCloneProject: true });
    try {
      await CreateProjectFromClone(name, url, branch, destParent);
      await get().refreshProjects();
      set({
        selected: name,
        view: "projects",
        cloneModalOpen: false,
      });
      toast.success(`Cloned ${name}`);
    } finally {
      set({ addingCloneProject: false });
    }
  },

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
          ? {
              ...p,
              actions: sortActionsByPosition(
                applyActionUpdates(p.actions ?? [], updates),
              ),
            }
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

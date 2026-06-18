import { create, type StoreApi } from "zustand";
import { toast } from "sonner";
import YAML from "yaml";
import {
  isDuplicate,
  isFooterDisplay,
  isHeaderDisplay,
  type ActionInfo,
  type ActionsLayout,
  type ProjectGroup,
  type ProjectInfo,
  type SpawnTask,
} from "../types";
import {
  AttachProject,
  BrowseFolder,
  CheckPortConflicts,
  CreateProject,
  CreateProjectFromClone,
  CreateSSHProject,
  CreateTemplate,
  DeleteTemplate,
  DetachProject,
  DuplicateProject,
  FocusDetachedWindow,
  ListDetachedProjects,
  ListProjects,
  ListTemplates,
  ReadConfig,
  RemoveProject,
  RemoveProjectCascade,
  RemoveProjects,
  RenameTemplate,
  ResolvePortConflict,
  SaveConfig,
  SetProjectLabel,
  StartProject,
  StopProject,
  ToggleProjectService,
} from "../../bridge/commands";
import type { main } from "../../bridge/models";
import { getSettings, loadSettings, saveSettings } from "./settings";
import { loadGroups, saveGroups, type GroupsConfig } from "./groups";
import {
  type SidebarLayout,
  addGroup as addGroupToLayout,
  removeGroup as removeGroupFromLayout,
  renameGroup as renameGroupInLayout,
  setGroupCollapsed,
  moveIntoGroup,
  moveOutOfGroup,
  membershipMap,
  groupToken,
  flattenForProjectOrder,
  reconcile,
  layoutsEqual,
} from "../components/sidebarLayout";
import { forgetProjectTerminals } from "../terminals";
import { activeChatStorageKey } from "../components/NotesView";
import { ACTION_SECTIONS, type ActionSection } from "../actionConfig";
import { editGlobalDoc, editProjectDoc, editRepoDoc } from "../yamlQueue";
import { applyOpToDoc } from "../actionsStructural";
import { splitChild } from "../actionIds";
import { applyMove } from "../components/actionsDndLayout";
import type { StructuralOp } from "../actionsGesture";
import type { ActionLevel } from "../actionLevels";

export type View =
  | "projects"
  | "terminals"
  | "settings"
  | "global-config"
  | "commit-instructions"
  | "pr-instructions"
  | "branch-instructions"
  | "template";

export type SettingsTab = "general" | "notifications" | "terminal" | "tts" | "ai" | "global-config" | "templates" | "backup";

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

  // Sidebar folders. `sidebarOrder` is the interleaved top-level order (loose
  // project names + "group:<id>" tokens); `groups` holds the folder defs.
  groups: ProjectGroup[];
  sidebarOrder: string[];

  selected: string | null;
  selectedTemplate: string | null;
  view: View;
  settingsTab: SettingsTab;
  sidebarCollapsed: boolean;
  feedbackOpen: boolean;
  tmuxReady: boolean | null;
  visited: Set<string>;
  // Source names with a duplication in flight. A multiset (repeats allowed) so
  // several copies of the same source can run at once and each finishing only
  // clears its own entry. Duplications never block one another.
  duplicatingNames: string[];
  removingNames: Set<string>;
  // Per-project queue of tasks (actions or ad-hoc commands) to auto-run once
  // the freshly created copy's detail mounts. Used by "Bulk Duplicate" to fan
  // work across every new copy without the user opening each one.
  spawnTasks: Record<string, SpawnTask[]>;
  addProjectPickerOpen: boolean;
  sshModalOpen: boolean;
  addingSSHProject: boolean;
  cloneModalOpen: boolean;
  addingCloneProject: boolean;
  portConflict: PortConflictPrompt | null;
  resolvingPortConflict: boolean;
  detached: Set<string>;

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
  resolvePortConflicts: (
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
  bulkDuplicate: (
    name: string,
    count: number,
    opts?: {
      excludeUncommitted?: boolean;
      reinstallDeps?: boolean;
      names?: string[];
      tasks?: SpawnTask[];
      groupName?: string;
    },
  ) => Promise<void>;
  consumeSpawnTasks: (name: string) => void;
  removeProject: (name: string) => Promise<void>;
  removeProjectCascade: (name: string) => Promise<void>;
  removeProjectsBatch: (names: string[]) => Promise<void>;
  renameProject: (name: string, label: string) => Promise<void>;
  createGroup: (name: string, opts?: { initialMember?: string }) => Promise<void>;
  renameGroup: (id: string, name: string) => Promise<void>;
  deleteGroup: (id: string) => Promise<void>;
  toggleGroupCollapsed: (id: string) => Promise<void>;
  moveProjectToGroup: (name: string, groupId: string | null) => Promise<void>;
  // Commit a full sidebar layout (on DnD drop): persists folders + order.
  applySidebarLayout: (layout: SidebarLayout) => Promise<void>;
  // Drop stale entries + append new projects after a project list refresh.
  reconcileSidebarLayout: (projects: ProjectInfo[]) => void;

  detachProject: (name: string) => Promise<void>;
  attachProject: (name: string) => Promise<void>;
  focusDetachedProject: (name: string) => Promise<boolean>;
  refreshDetached: () => Promise<void>;
  reorderActions: (projectName: string, layout: ActionsLayout) => Promise<void>;
  applyStructuralOp: (
    projectName: string,
    op: StructuralOp,
    level: ActionLevel,
  ) => Promise<void>;
  // Optimistic update without persist; final commit happens on drop via
  // reorderActions.
  previewReorderActions: (projectName: string, layout: ActionsLayout) => void;
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

// Per-project write chain so a quick reorder + undo can't race two
// read-modify-write SaveConfig calls through each other.
const actionsWriteChain = new Map<string, Promise<void>>();

function serializeActionsWrite(
  projectName: string,
  task: () => Promise<void>,
): Promise<void> {
  const prev = actionsWriteChain.get(projectName) ?? Promise.resolve();
  const next = prev.catch(() => undefined).then(task);
  actionsWriteChain.set(projectName, next);
  next.finally(() => {
    if (actionsWriteChain.get(projectName) === next) {
      actionsWriteChain.delete(projectName);
    }
  });
  return next;
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

function captureActionsLayout(actions: ActionInfo[] | undefined): ActionsLayout {
  const header: string[] = [];
  const footer: string[] = [];
  for (const a of sortActionsByPosition(actions ?? [])) {
    if (isHeaderDisplay(a.display)) header.push(a.name);
    else if (isFooterDisplay(a.display)) footer.push(a.name);
  }
  return { header, footer };
}

function projectsEqual(a: ProjectInfo[], b: ProjectInfo[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

type AppSet = StoreApi<AppState>["setState"];
type AppGet = StoreApi<AppState>["getState"];

function applyActionsLayoutToStore(
  set: AppSet,
  projectName: string,
  project: ProjectInfo,
  layout: ActionsLayout,
): Map<string, ActionUpdate> {
  const updates = buildActionUpdates(project.actions ?? [], layout);
  set((s) => ({
    projects: s.projects.map((p) =>
      p.name === projectName
        ? { ...p, actions: sortActionsByPosition(applyActionUpdates(p.actions ?? [], updates)) }
        : p,
    ),
  }));
  return updates;
}

// On failure, resync from disk so the optimistic state doesn't drift.
async function persistActionsLayoutOrRecover(
  get: AppGet,
  projectName: string,
  updates: Map<string, ActionUpdate>,
): Promise<void> {
  try {
    await serializeActionsWrite(projectName, () =>
      persistActionUpdates(projectName, updates),
    );
  } catch (err) {
    toast.error(`Failed to save action order: ${err}`);
    await get().refreshProjects();
  }
}

// Resolved display order of a menu's children (leaf names) — children can
// span config layers, so the resolver output is the only authoritative order.
function menuChildOrder(get: AppGet, projectName: string, parent: string): string[] {
  const project = get().projects.find((p) => p.name === projectName);
  const menu = project?.actions?.find((a) => a.name === parent);
  return (menu?.children ?? []).map((c) => splitChild(c.name)?.child ?? c.name);
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

// Drop client-side state tied to projects that no longer exist: their cached
// terminal panes and persisted chat selection.
function forgetRemovedProjects(names: string[]) {
  for (const name of names) {
    forgetProjectTerminals(name);
    window.localStorage.removeItem(activeChatStorageKey(name));
  }
}

// Removals run concurrently, so `removingNames` is tracked additively: each
// flow unions its own names in while it runs and removes only those when done.
const withAdded = (prev: Set<string>, names: string[]) =>
  new Set([...prev, ...names]);
const withRemoved = (prev: Set<string>, names: string[]) => {
  const next = new Set(prev);
  names.forEach((n) => next.delete(n));
  return next;
};

async function runProjectRemoval(
  set: AppSet,
  get: AppGet,
  name: string,
  removedNames: string[],
  call: () => Promise<unknown>,
) {
  if (removedNames.some((n) => get().removingNames.has(n))) return;
  set((s) => ({ removingNames: withAdded(s.removingNames, removedNames) }));
  try {
    await call();
    forgetRemovedProjects(removedNames);
    const sel = get().selected;
    if (sel && removedNames.includes(sel)) set({ selected: null });
    await get().refreshProjects();
  } catch (err) {
    toast.error(`Failed to remove ${name}: ${err}`);
  } finally {
    set((s) => ({ removingNames: withRemoved(s.removingNames, removedNames) }));
  }
}

// Names of top-level (non-duplicate) projects — the only names that ever
// appear in `sidebarOrder` or a folder's `members`. A project is a duplicate
// when its parent exists in the list (mirrors Sidebar's `isChild`).
function topLevelProjectNames(projects: ProjectInfo[]): string[] {
  const names = new Set(projects.map((p) => p.name));
  return projects.filter((p) => !isDuplicate(p, names)).map((p) => p.name);
}

// A folder member is any existing project: placing a duplicate in a folder
// promotes it out of its parent's nesting and onto the folder's level.
// Unknown names -> none.
function resolveMemberName(projects: ProjectInfo[], name: string): string | undefined {
  return projects.some((p) => p.name === name) ? name : undefined;
}

// Where a project sits at the top level: its own slot if loose, else its
// folder's token slot. Used to drop a new folder where its seed project was.
function topLevelIndexOfProject(layout: SidebarLayout, name: string): number {
  const direct = layout.order.indexOf(name);
  if (direct >= 0) return direct;
  const gid = membershipMap(layout.groups).get(name);
  if (gid) {
    const ti = layout.order.indexOf(groupToken(gid));
    if (ti >= 0) return ti;
  }
  return layout.order.length;
}

// Folders -> groups.json; order -> settings (sidebarOrder + the flattened
// projectOrder the backend reads). saveSettings dirty-checks, so a folders-only
// change (e.g. collapse) skips the settings write.
async function persistSidebarLayout(layout: SidebarLayout): Promise<void> {
  await Promise.all([
    saveGroups({ groups: layout.groups }),
    saveSettings({
      sidebarOrder: layout.order,
      projectOrder: flattenForProjectOrder(layout),
    }),
  ]);
}

export const useAppStore = create<AppState>((set, get) => ({
  projects: [],
  templates: [],

  groups: [],
  sidebarOrder: [],

  selected: null,
  selectedTemplate: null,
  view: "projects",
  settingsTab: "general",
  sidebarCollapsed: false,
  feedbackOpen: false,
  tmuxReady: null,
  visited: new Set<string>(),
  duplicatingNames: [],
  spawnTasks: {},
  removingNames: new Set<string>(),
  addProjectPickerOpen: false,
  sshModalOpen: false,
  addingSSHProject: false,
  cloneModalOpen: false,
  addingCloneProject: false,
  portConflict: null,
  resolvingPortConflict: false,
  detached: new Set<string>(),

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
      // Status-only refreshes (the 10s poll, agent status events) leave the
      // project set unchanged — skip the reconcile, which can only differ when
      // projects are added or removed.
      if (projectsEqual(get().projects, list)) return;
      set({ projects: list });
      get().reconcileSidebarLayout(list);
    } catch (err) {
      console.error("Failed to load projects:", err);
    }
  },

  reconcileSidebarLayout: (projects) => {
    const before: SidebarLayout = { order: get().sidebarOrder, groups: get().groups };
    const after = reconcile(
      before,
      topLevelProjectNames(projects),
      projects.map((p) => p.name),
    );
    if (layoutsEqual(before, after)) return;
    set({ sidebarOrder: after.order, groups: after.groups });
    persistSidebarLayout(after).catch(() => undefined);
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
        const ok = await get().resolvePortConflicts(
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

  resolvePortConflicts: async (title, conflicts) => {
    const policyOf = (c: main.PortConflictInfo) => c.portConflict || "ask";
    const noun = (cs: main.PortConflictInfo[]) => (cs.length > 1 ? "ports" : "port");
    const list = (cs: main.PortConflictInfo[]) => cs.map((c) => c.port).join(", ");

    const fails = conflicts.filter((c) => policyOf(c) === "fail");
    if (fails.length > 0) {
      toast.error(`${title}: ${noun(fails)} ${list(fails)} in use`);
      return false;
    }
    const frees = conflicts.filter((c) => policyOf(c) === "free");
    if (frees.length > 0) {
      try {
        await Promise.all(frees.map((c) => ResolvePortConflict(c)));
        toast.success(`Freed ${noun(frees)} ${list(frees)}`);
      } catch (err) {
        toast.error(`Failed to free port: ${err}`);
        return false;
      }
    }
    const asks = conflicts.filter((c) => policyOf(c) === "ask");
    if (asks.length > 0) {
      return await get().triggerPortConflictPrompt(title, asks);
    }
    return true;
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

  bulkDuplicate: async (name, count, opts = {}) => {
    if (count < 1) return;
    const tasks = opts.tasks ?? [];
    set((s) => ({ duplicatingNames: [...s.duplicatingNames, name] }));
    const noun = (n: number) => (n === 1 ? "copy" : "copies");
    const toastId = toast.loading(`Creating ${count} ${noun(count)} of ${name}…`);
    const created: string[] = [];
    try {
      // Create copies one at a time so each can start working the moment it's
      // ready, instead of waiting for the whole batch. After each copy: queue
      // its tasks, refresh so it (with its actions) enters the list, then mark
      // it visited — that mounts its detail and fires the auto-run effect.
      for (let i = 0; i < count; i++) {
        let newName: string | null;
        try {
          newName = await DuplicateProject(
            name,
            (opts.names?.[i] ?? "").trim(),
            opts.excludeUncommitted ?? false,
            opts.reinstallDeps ?? false,
          );
        } catch (err) {
          if (created.length === 0) throw err;
          break;
        }
        if (!newName) break;
        const copyName = newName;
        created.push(copyName);
        if (tasks.length > 0) {
          set((s) => ({ spawnTasks: { ...s.spawnTasks, [copyName]: tasks } }));
        }
        await get().refreshProjects();
        get().markVisited(copyName);
        if (created.length === 1) set({ selected: copyName, view: "projects" });
      }
      const folderName = opts.groupName?.trim();
      if (folderName && created.length > 0) {
        try {
          let layout: SidebarLayout = { order: get().sidebarOrder, groups: get().groups };
          let group =
            layout.groups.find((g) => g.name.trim() === folderName) ??
            layout.groups.find(
              (g) => g.name.trim().toLowerCase() === folderName.toLowerCase(),
            );
          if (!group) {
            group = { id: crypto.randomUUID(), name: folderName, members: [] };
            // Drop the new folder directly below the project being duplicated,
            // not at the bottom of the sidebar.
            const atIndex = topLevelIndexOfProject(layout, name) + 1;
            layout = addGroupToLayout(layout, group, atIndex);
          }
          for (const copyName of created) layout = moveIntoGroup(layout, copyName, group.id);
          await get().applySidebarLayout(layout);
        } catch (err) {
          toast.error(`Couldn't add copies to folder: ${err}`);
        }
      }
      if (created.length === 0) {
        toast.error(`Failed to duplicate ${name}`, { id: toastId });
      } else if (created.length < count) {
        toast.error(
          `Created ${created.length} of ${count} ${noun(count)} of ${name}`,
          { id: toastId },
        );
      } else {
        toast.success(
          `Created ${created.length} ${noun(created.length)} of ${name}`,
          { id: toastId },
        );
      }
    } catch (err) {
      toast.error(`Failed to duplicate ${name}: ${err}`, { id: toastId });
    } finally {
      set((s) => {
        const i = s.duplicatingNames.indexOf(name);
        if (i < 0) return s;
        const next = s.duplicatingNames.slice();
        next.splice(i, 1);
        return { duplicatingNames: next };
      });
    }
  },

  consumeSpawnTasks: (name) =>
    set((s) => {
      if (!(name in s.spawnTasks)) return s;
      const next = { ...s.spawnTasks };
      delete next[name];
      return { spawnTasks: next };
    }),

  removeProject: (name) =>
    runProjectRemoval(set, get, name, [name], () => RemoveProject(name)),

  removeProjectCascade: (name) =>
    runProjectRemoval(
      set,
      get,
      name,
      [name, ...get().projects.filter((p) => p.parentName === name).map((p) => p.name)],
      () => RemoveProjectCascade(name),
    ),

  removeProjectsBatch: async (names) => {
    if (names.length === 0 || names.some((n) => get().removingNames.has(n)))
      return;
    set((s) => ({ removingNames: withAdded(s.removingNames, names) }));
    try {
      const failed: string[] = (await RemoveProjects(names)) || [];
      const failedSet = new Set(failed);
      const removed = names.filter((n) => !failedSet.has(n));
      forgetRemovedProjects(removed);
      set((s) =>
        s.selected && removed.includes(s.selected) ? { selected: null } : s,
      );
      await get().refreshProjects();
      if (failed.length > 0) {
        const plural = (n: number) => (n === 1 ? "project" : "projects");
        toast.error(
          removed.length > 0
            ? `Removed ${removed.length}, ${failed.length} failed`
            : `Failed to remove ${failed.length} ${plural(failed.length)}`,
        );
      }
    } catch (err) {
      toast.error(`Failed to remove projects: ${err}`);
    } finally {
      set((s) => ({ removingNames: withRemoved(s.removingNames, names) }));
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

  applySidebarLayout: async (layout) => {
    // Normalize before committing so a move can't persist an unrepresentable
    // token — e.g. removing a duplicate from a folder leaves it with no loose
    // top-level slot, so reconcile drops the stray token and it nests under its
    // parent again. Idempotent, so a clean drag-drop layout passes through.
    const projects = get().projects;
    const next = reconcile(
      layout,
      topLevelProjectNames(projects),
      projects.map((p) => p.name),
    );
    const prev: SidebarLayout = { order: get().sidebarOrder, groups: get().groups };
    set({ sidebarOrder: next.order, groups: next.groups });
    // Reference may differ even when content matches (e.g. collapse no-op) —
    // update state but skip the persist.
    if (layoutsEqual(prev, next)) return;
    try {
      await persistSidebarLayout(next);
    } catch (err) {
      toast.error(`Failed to save folders: ${err}`);
      const cfg = await loadGroups();
      const fresh = await loadSettings();
      set({ groups: cfg.groups, sidebarOrder: fresh.sidebarOrder ?? [] });
    }
  },

  createGroup: async (name, opts = {}) => {
    const trimmed = name.trim() || "New Folder";
    const id = crypto.randomUUID();
    const current: SidebarLayout = { order: get().sidebarOrder, groups: get().groups };
    const seed = opts.initialMember
      ? resolveMemberName(get().projects, opts.initialMember)
      : undefined;
    const atIndex = seed ? topLevelIndexOfProject(current, seed) : undefined;
    let next = addGroupToLayout(current, { id, name: trimmed, members: [] }, atIndex);
    if (seed) next = moveIntoGroup(next, seed, id);
    await get().applySidebarLayout(next);
  },

  renameGroup: async (id, name) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const current: SidebarLayout = { order: get().sidebarOrder, groups: get().groups };
    await get().applySidebarLayout(renameGroupInLayout(current, id, trimmed));
  },

  deleteGroup: async (id) => {
    const current: SidebarLayout = { order: get().sidebarOrder, groups: get().groups };
    await get().applySidebarLayout(removeGroupFromLayout(current, id));
  },

  toggleGroupCollapsed: async (id) => {
    const current: SidebarLayout = { order: get().sidebarOrder, groups: get().groups };
    const group = current.groups.find((g) => g.id === id);
    if (!group) return;
    await get().applySidebarLayout(setGroupCollapsed(current, id, !group.collapsed));
  },

  moveProjectToGroup: async (name, groupId) => {
    const target = resolveMemberName(get().projects, name);
    if (!target) return;
    const current: SidebarLayout = { order: get().sidebarOrder, groups: get().groups };
    const next =
      groupId === null
        ? moveOutOfGroup(current, target, current.order.length)
        : moveIntoGroup(current, target, groupId);
    await get().applySidebarLayout(next);
  },

  refreshDetached: async () => {
    try {
      const raw = (await ListDetachedProjects()) as string[] | null;
      const next = new Set<string>(raw ?? []);
      set((s) => {
        if (s.detached.size === next.size && [...s.detached].every((n) => next.has(n))) {
          return s;
        }
        return { detached: next };
      });
    } catch (err) {
      console.error("Failed to load detached projects:", err);
    }
  },

  detachProject: async (name) => {
    try {
      await DetachProject(name);
      set((s) => {
        const detached = s.detached.has(name)
          ? s.detached
          : new Set<string>([...s.detached, name]);
        // Clear inline selection so lastSelectedProject persistence
        // doesn't carry the now-detached project, and so EmptyState
        // shows in the main pane without needing a derived guard.
        const selected = s.selected === name ? null : s.selected;
        if (detached === s.detached && selected === s.selected) return s;
        return { detached, selected };
      });
    } catch (err) {
      toast.error(`Failed to detach ${name}: ${err}`);
    }
  },

  attachProject: async (name) => {
    try {
      await AttachProject(name);
      set((s) => {
        if (!s.detached.has(name)) return s;
        const next = new Set<string>(s.detached);
        next.delete(name);
        return { detached: next };
      });
    } catch (err) {
      toast.error(`Failed to attach ${name}: ${err}`);
    }
  },

  focusDetachedProject: async (name) => {
    try {
      return (await FocusDetachedWindow(name)) as boolean;
    } catch (err) {
      console.error("Failed to focus detached window:", err);
      return false;
    }
  },

  reorderActions: async (projectName, layout) => {
    const project = get().projects.find((p) => p.name === projectName);
    if (!project) return;
    // Position values can collide across groups because the header/
    // footer/menu filter runs after the sort. Display is only touched
    // when an action's group changed, so legacy values like "button"
    // survive a within-group reorder.
    const updates = applyActionsLayoutToStore(set, projectName, project, layout);
    await persistActionsLayoutOrRecover(get, projectName, updates);
  },

  applyStructuralOp: async (projectName, op, level) => {
    const childOrder =
      op.kind === "reorderMenu" ? menuChildOrder(get, projectName, op.parent) : undefined;
    const mutate = (doc: ReturnType<typeof YAML.parseDocument>) =>
      applyOpToDoc(doc, op, childOrder);
    try {
      if (level === "global") await editGlobalDoc(mutate);
      else if (level === "repo") await editRepoDoc(projectName, mutate);
      else await editProjectDoc(projectName, mutate);
      await get().refreshProjects();
      // An extracted item lands appended; place it at the dropped gap by
      // running the normal reorder (which also sets its header/footer group).
      if (op.kind === "extractToTop" && op.group && op.index != null) {
        const project = get().projects.find((p) => p.name === projectName);
        if (project) {
          const base = captureActionsLayout(project.actions);
          const next = applyMove(base, op.child, { group: op.group, index: op.index });
          await get().reorderActions(projectName, next);
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toast.error(`Failed to restructure actions: ${message}`);
      await get().refreshProjects();
    }
  },

  previewReorderActions: (projectName, layout) => {
    const project = get().projects.find((p) => p.name === projectName);
    if (!project) return;
    applyActionsLayoutToStore(set, projectName, project, layout);
  },

  refreshAfterRename: async (newName) => {
    await get().refreshProjects();
    if (newName && newName !== get().selected) set({ selected: newName });
  },
}));

// Called once after `loadSettings()`/`loadGroups()` resolve so the store picks
// up the persisted selection and sidebar folders before the app first renders.
// Keeping this out of the initializer lets the store module import cleanly even
// when settings haven't been loaded yet.
export function hydrateAppStore(groups?: GroupsConfig): void {
  const last = getSettings().lastSelectedProject ?? null;
  useAppStore.setState({
    selected: last,
    groups: groups?.groups ?? [],
    sidebarOrder: getSettings().sidebarOrder ?? [],
  });
}

import { create, type StoreApi } from "zustand";
import { toast } from "sonner";
import YAML from "yaml";
import {
  isDuplicate,
  isFooterDisplay,
  isHeaderDisplay,
  type ActionInfo,
  type ActionsLayout,
  type GeneratorRunSpec,
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
  DuplicateStatus,
  FocusDetachedWindow,
  ListDetachedProjects,
  ListProjects,
  ListTemplates,
  MoveProjectRoot,
  PeerState,
  ReadConfig,
  RemoveProject,
  RemoveProjectCascade,
  RemoveProjects,
  RenameTemplate,
  ResolvePortConflict,
  SaveConfig,
  SetProjectLabel,
  StartCloneProject,
  StartDuplicateProject,
  StartProject,
  StopProject,
  ToggleProjectService,
  TrashProject,
} from "../../bridge/commands";
import { EventsOn } from "../../bridge/runtime";
import type { main } from "../../bridge/models";
import { reportError } from "../diagnostics";
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
  flattenForProjectOrder,
  expandRemovalSet,
  topLevelIndexOfProject,
  projectAnchorIndex,
  dupInsertIndex,
  reconcile,
  layoutsEqual,
} from "../components/sidebarLayout";
import { forgetProjectTerminals, appendPersistedTab, removePersistedTabById } from "../terminals";
import { isPeerName, peerSlugOf, prefixName, prefixRoot } from "../peer/markers";
import { activeChatStorageKey } from "../components/NotesView";
import { ACTION_SECTIONS, type ActionSection } from "../actionConfig";
import { editGlobalDoc, editProjectDoc, editRepoDoc } from "../yamlQueue";
import { applyOpToDoc } from "../actionsStructural";
import { menuChildOrderFor } from "../actionTree";
import { applyMove } from "../components/actionsDndLayout";
import type { StructuralOp } from "../actionsGesture";
import type { ActionLevel } from "../actionLevels";
import { projectStartProfile } from "../projectStartProfile";

export type View =
  | "projects"
  | "terminals"
  | "stats"
  | "scheduled"
  | "settings"
  | "global-config"
  | "claude-statusline"
  | "codex-statusline"
  | "commit-instructions"
  | "pr-instructions"
  | "branch-instructions"
  | "template";

export type SettingsTab = "general" | "notifications" | "terminal" | "shortcuts" | "tts" | "ai" | "templates" | "backup" | "mobile" | "connect-macs";

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
  // The Usage dashboard is an overlay, not a main-area view — a detached window
  // can request it via FocusMainWindow("usage"), so it lives in the store.
  usageOpen: boolean;
  tmuxReady: boolean | null;
  visited: Set<string>;
  // Most-recently-selected project names, most-recent-first. Drives the
  // Ctrl+Tab MRU switcher. Session-only; not persisted.
  mruProjects: string[];
  // Source names with a duplication in flight. A multiset (repeats allowed) so
  // several copies of the same source can run at once and each finishing only
  // clears its own entry. Duplications never block one another.
  duplicatingNames: string[];
  removingNames: Set<string>;
  // Per-project queue of tasks (actions or ad-hoc commands) to auto-run once
  // the project's detail mounts. Seeded by "Bulk Duplicate" (fan work across
  // every new copy) and by the CLI / mobile `run` relay. `nonce` is monotonic
  // so an already-mounted detail re-fires on a fresh queue instead of latching
  // once per mount.
  spawnTasks: Record<string, { tasks: SpawnTask[]; nonce: number }>;
  addProjectPickerOpen: boolean;
  // Non-null when the add-project flow targets a remote Mac (peer). The whole
  // flow — picker, clone modal, folder browser — reads this to route creation to
  // the peer instead of the local machine.
  addProjectTarget: { slug: string; alias: string } | null;
  remoteFolderPickerOpen: boolean;
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
  setUsageOpen: (open: boolean) => void;
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
  addProjectForPeer: (slug: string, alias: string) => void;
  closeAddProjectPicker: () => void;
  closeRemoteFolderPicker: () => void;
  createRemoteProjectFromFolder: (hostDir: string) => Promise<void>;
  pickAddProjectKind: (kind: "local" | "ssh" | "clone") => Promise<void>;
  closeSSHModal: () => void;
  addSSHProject: (params: SSHProjectParams) => Promise<void>;
  openAddCloneModal: () => void;
  closeAddCloneModal: () => void;
  addCloneProject: (params: CloneProjectParams) => Promise<void>;
  pendingGeneratorRun: { projectName: string; spec: GeneratorRunSpec } | null;
  runGenerator: (opts: { folder: string; name: string; spec: GeneratorRunSpec }) => Promise<void>;
  clearPendingGeneratorRun: () => void;
  // A run-action / new-terminal request relayed from the mobile app. `action` is
  // the action's (possibly composite) name, or null for a plain new terminal.
  // `nonce` lets an already-mounted ProjectDetail re-fire on repeat requests.
  pendingRemoteAction: {
    projectName: string;
    action: string | null;
    nonce: number;
    // Relayed from mobile after it ran the inputs + confirm gauntlet on the phone.
    inputValues?: Record<string, string>;
    confirmed?: boolean;
  } | null;
  triggerRemoteAction: (
    projectName: string,
    action: string | null,
    inputValues?: Record<string, string>,
    confirmed?: boolean,
  ) => void;
  clearPendingRemoteAction: () => void;
  // A "switch to config/notes/AI view" request from the sidebar context menu.
  // Selects+mounts the project, then parks the target view for the mounted
  // ProjectDetail's consumer effect (nonce lets an already-mounted detail re-fire).
  pendingDetailView: {
    projectName: string;
    view: "config" | "notes" | "ai";
    nonce: number;
  } | null;
  openProjectDetailView: (projectName: string, view: "config" | "notes" | "ai") => void;
  clearPendingDetailView: () => void;
  // A terminal-tab op (close / rename / pin / reorder) relayed from the mobile
  // app. Addressed by terminal id, except reorder which carries the full new id
  // order. Consumed by the mounted ProjectDetail.
  pendingRemoteTerminalOp: {
    projectName: string;
    op: "close" | "rename" | "pin" | "reorder";
    id: string;
    label: string;
    order: string[];
    nonce: number;
  } | null;
  triggerRemoteTerminalOp: (
    projectName: string,
    op: "close" | "rename" | "pin" | "reorder",
    id: string,
    label: string,
    order: string[],
  ) => void;
  clearPendingRemoteTerminalOp: () => void;
  // A peer Mac spawned a terminal on this host; surface it as a tab. When the
  // project is mounted the live tree adopts it via this op; when it isn't, the
  // tab is parked in the persisted tree cache for the next open.
  pendingAdoptTerminal: {
    projectName: string;
    id: string;
    label: string;
    startCmd?: string;
    resumeCmd?: string;
    actionName?: string;
    nonce: number;
  } | null;
  adoptRemoteTerminal: (
    projectName: string,
    id: string,
    label: string,
    opts?: { startCmd?: string; resumeCmd?: string; actionName?: string },
  ) => void;
  clearPendingAdoptTerminal: () => void;
  // A peer Mac closed a terminal it had spawned here; drop the host tab holding
  // that pty id. Mounted projects remove it from the live tree via this op; a
  // parked (unmounted) tab is dropped from the persisted cache directly.
  pendingRemoveTerminal: { id: string; nonce: number } | null;
  removeRemoteTerminal: (id: string) => void;
  clearPendingRemoveTerminal: () => void;
  bulkDuplicate: (
    name: string,
    count: number,
    opts?: {
      excludeUncommitted?: boolean;
      reinstallDeps?: boolean;
      pullLatest?: boolean;
      labels?: string[];
      tasksPerCopy?: SpawnTask[][];
      // Index-aligned with labels/tasksPerCopy: the project each copy is
      // duplicated FROM — a local name or a prefixed peer name, so a copy can be
      // created on whichever Mac already has the project. Missing/empty entries
      // fall back to `name`. Never copies files between machines.
      targetsPerCopy?: string[];
      groupName?: string;
    },
  ) => Promise<void>;
  consumeSpawnTasks: (name: string) => void;
  queueSpawnTask: (name: string, task: SpawnTask) => void;
  removeProject: (name: string) => Promise<void>;
  removeProjectCascade: (name: string) => Promise<void>;
  removeProjectFromDisk: (name: string) => Promise<void>;
  removeProjectsBatch: (names: string[]) => Promise<string[]>;
  renameProject: (name: string, label: string) => Promise<void>;
  moveProjectRoot: (name: string, newRoot: string) => Promise<void>;
  createGroup: (name: string, opts?: { initialMembers?: string[] }) => Promise<void>;
  renameGroup: (id: string, name: string) => Promise<void>;
  deleteGroup: (id: string) => Promise<void>;
  toggleGroupCollapsed: (id: string) => Promise<void>;
  moveProjectToGroup: (name: string, groupId: string | null) => Promise<void>;
  moveProjectsToGroup: (names: string[], groupId: string | null) => Promise<void>;
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
  return project ? menuChildOrderFor(project.actions, parent) : [];
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

// Monotonic id for phone-relayed requests (run-action / terminal-op). Never
// derived from the pending slot: it is cleared after each consume, so a
// derived nonce would restart at 1 and match the consumer's already-consumed
// latch — silently dropping every request after the first.
let remoteRequestNonce = 0;

// Monotonic id for queued spawn tasks. Kept separate from the pending slot so a
// consumed-then-recreated entry never restarts below the consumer's latch and
// gets silently dropped — the same hazard `remoteRequestNonce` guards against.
let spawnTaskNonce = 0;

// Rejected from a remote clone wait when the peer drops mid-clone, so the caller
// can distinguish "connection lost" (toast) from a clone failure (modal error).
class LostPeerError extends Error {
  constructor() {
    super("Lost connection to the remote Mac.");
    this.name = "LostPeerError";
  }
}

// Invoke `onLost` when the given peer is no longer connected. Returns an
// unsubscribe for the underlying peer-state-changed listener.
function watchPeerLoss(slug: string, onLost: () => void): () => void {
  return EventsOn("peer-state-changed", () => {
    void PeerState()
      .then((s) => {
        const peers =
          (s as { peers?: { slug: string; connected: boolean }[] } | null)?.peers ?? [];
        if (!peers.some((pe) => pe.slug === slug && pe.connected)) onLost();
      })
      .catch(() => {});
  });
}

// Wait for a clone started on a peer via StartCloneProject to finish. Resolves on
// the matching `clone-done` (peer payloads arrive translated, so match on the
// prefixed name); rejects on a clone error, or with LostPeerError if the peer
// disconnects mid-clone. Listeners are torn down on settle or via `cancel`, so no
// global subscription leaks when the start call itself fails.
function waitForRemoteClone(
  prefixedName: string,
  slug: string,
): { promise: Promise<void>; cancel: () => void } {
  let cleanup = () => {};
  const promise = new Promise<void>((resolve, reject) => {
    let off = () => {};
    let offPeer = () => {};
    cleanup = () => {
      off();
      offPeer();
    };
    off = EventsOn("clone-done", (payload) => {
      const p = payload as { name?: string; ok?: boolean; error?: string } | null;
      if (!p || p.name !== prefixedName) return;
      cleanup();
      if (p.ok) resolve();
      else reject(new Error(p.error || "Clone failed"));
    });
    offPeer = watchPeerLoss(slug, () => {
      cleanup();
      reject(new LostPeerError());
    });
  });
  return { promise, cancel: () => cleanup() };
}

const DUPLICATE_STATUS_POLL_MS = 10_000;

// Collect `duplicate-done` outcomes for duplicates started on a peer via
// StartDuplicateProject. Must be created BEFORE the first start call: the peer
// event tap is installed per-subscription via an async listen(), so subscribing
// only after the (full peer round-trip) start call could drop a fast duplicate's
// event and leave its waiter hanging forever. Events arriving before their
// `wait` are buffered by copy name; a peer disconnect rejects all pending and
// future waits with LostPeerError. The event is only the fast path — the host
// forwards it over a bounded queue that drops frames under load — so each wait
// also polls the host's authoritative `duplicate_status` registry until it
// settles. `dispose` tears down the listeners and any live polls.
function collectRemoteDuplicates(slug: string): {
  wait: (prefixedName: string) => Promise<void>;
  dispose: () => void;
} {
  type Outcome = { ok: boolean; error?: string };
  interface Waiter {
    settle: (o: Outcome) => void;
    fail: (e: Error) => void;
  }
  const buffered = new Map<string, Outcome>();
  const pending = new Map<string, Waiter>();
  let lost = false;
  const failure = (o: Outcome) => new Error(o.error || "Duplicate failed");
  const off = EventsOn("duplicate-done", (payload) => {
    const p = payload as { name?: string; ok?: boolean; error?: string } | null;
    if (!p || typeof p.name !== "string") return;
    const outcome: Outcome = { ok: p.ok === true, error: p.error };
    const waiter = pending.get(p.name);
    if (waiter) waiter.settle(outcome);
    else buffered.set(p.name, outcome);
  });
  const offPeer = watchPeerLoss(slug, () => {
    lost = true;
    const waiters = [...pending.values()];
    for (const w of waiters) w.fail(new LostPeerError());
  });
  return {
    wait: (prefixedName) => {
      const seen = buffered.get(prefixedName);
      if (seen) {
        buffered.delete(prefixedName);
        return seen.ok ? Promise.resolve() : Promise.reject(failure(seen));
      }
      if (lost) return Promise.reject(new LostPeerError());
      return new Promise<void>((resolve, reject) => {
        const poll = setInterval(() => {
          void DuplicateStatus(prefixedName)
            .then((status) => {
              const waiter = pending.get(prefixedName);
              if (!waiter) return;
              const done = (status as { done?: { ok?: boolean; error?: string } } | null)?.done;
              if (done) waiter.settle({ ok: done.ok === true, error: done.error ?? undefined });
              else if (status === "unknown") {
                waiter.fail(
                  new Error("The remote Mac no longer reports this copy — it may have restarted."),
                );
              }
            })
            .catch(() => {});
        }, DUPLICATE_STATUS_POLL_MS);
        const finish = () => {
          clearInterval(poll);
          pending.delete(prefixedName);
        };
        pending.set(prefixedName, {
          settle: (o) => {
            finish();
            if (o.ok) resolve();
            else reject(failure(o));
          },
          fail: (e) => {
            finish();
            reject(e);
          },
        });
      });
    },
    dispose: () => {
      off();
      offPeer();
      for (const w of pending.values()) w.fail(new LostPeerError());
    },
  };
}

const projectsByName = (projects: ProjectInfo[]): Map<string, ProjectInfo> =>
  new Map(projects.map((p) => [p.name, p]));

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
  usageOpen: false,
  tmuxReady: null,
  visited: new Set<string>(),
  mruProjects: [],
  duplicatingNames: [],
  spawnTasks: {},
  removingNames: new Set<string>(),
  addProjectPickerOpen: false,
  addProjectTarget: null,
  remoteFolderPickerOpen: false,
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

  setUsageOpen: (usageOpen) => set({ usageOpen }),

  setTmuxReady: (tmuxReady) => set({ tmuxReady }),

  selectProject: (name) =>
    set((s) => ({
      selected: name,
      selectedTemplate: null,
      view: "projects",
      mruProjects: [name, ...s.mruProjects.filter((n) => n !== name)],
    })),

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
      reportError("projects.refresh_failed", err);
    }
  },

  reconcileSidebarLayout: (projects) => {
    // Remote (peer) projects render in their own non-reorderable sections and
    // never belong to sidebarOrder or folders — keep them out of the layout.
    const local = projects.filter((p) => !isPeerName(p.name));
    const before: SidebarLayout = { order: get().sidebarOrder, groups: get().groups };
    const after = reconcile(
      before,
      topLevelProjectNames(local),
      local.map((p) => p.name),
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
      reportError("templates.refresh_failed", err);
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
    await get().startProject(name, projectStartProfile(project));
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

  addProject: () => set({ addProjectTarget: null, addProjectPickerOpen: true }),

  addProjectForPeer: (slug, alias) =>
    set({ addProjectTarget: { slug, alias }, addProjectPickerOpen: true }),

  closeAddProjectPicker: () => set({ addProjectPickerOpen: false, addProjectTarget: null }),

  closeRemoteFolderPicker: () =>
    set({ remoteFolderPickerOpen: false, addProjectTarget: null }),

  createRemoteProjectFromFolder: async (hostDir) => {
    const target = get().addProjectTarget;
    if (!target) return;
    const name = hostDir.split("/").filter(Boolean).pop() || "new-project";
    try {
      // The marked root routes CreateProject to the peer (marker stripped before
      // it reaches the host), so the folder is adopted on the remote Mac.
      await CreateProject(name, prefixRoot(target.slug, hostDir));
      await get().refreshProjects();
      set({
        selected: prefixName(target.slug, name),
        view: "projects",
        remoteFolderPickerOpen: false,
        addProjectTarget: null,
      });
    } catch (err) {
      toast.error(`Failed to add project on ${target.alias}: ${err}`);
    }
  },

  pickAddProjectKind: async (kind) => {
    const target = get().addProjectTarget;
    set({ addProjectPickerOpen: false });
    if (kind === "ssh") {
      set({ sshModalOpen: true });
      return;
    }
    if (kind === "clone") {
      set({ cloneModalOpen: true });
      return;
    }
    // Local Folder: on a peer, browse the host filesystem; locally, use the
    // native picker.
    if (target) {
      set({ remoteFolderPickerOpen: true });
      return;
    }
    try {
      const dir = await BrowseFolder(getSettings().defaultProjectDirectory);
      if (!dir) return;
      const name = dir.split("/").pop() || "new-project";
      await CreateProject(name, dir);
      await get().refreshProjects();
      set({ selected: name, view: "projects" });
    } catch (err) {
      toast.error(`Failed to add project: ${err}`);
    }
  },

  pendingGeneratorRun: null,

  clearPendingGeneratorRun: () => set({ pendingGeneratorRun: null }),

  pendingRemoteAction: null,

  // Mount/activate the target project (only a mounted ProjectDetail has a live
  // TerminalView to run in), then park the request for its consumer effect.
  triggerRemoteAction: (projectName, action, inputValues, confirmed) =>
    set((s) => ({
      selected: projectName,
      view: "projects",
      visited: new Set([...s.visited, projectName]),
      pendingRemoteAction: {
        projectName,
        action,
        nonce: ++remoteRequestNonce,
        inputValues,
        confirmed,
      },
    })),

  clearPendingRemoteAction: () => set({ pendingRemoteAction: null }),

  pendingDetailView: null,

  openProjectDetailView: (projectName, view) =>
    set((s) => ({
      selected: projectName,
      selectedTemplate: null,
      view: "projects",
      visited: new Set([...s.visited, projectName]),
      mruProjects: [projectName, ...s.mruProjects.filter((n) => n !== projectName)],
      pendingDetailView: { projectName, view, nonce: ++remoteRequestNonce },
    })),

  clearPendingDetailView: () => set({ pendingDetailView: null }),

  pendingRemoteTerminalOp: null,

  triggerRemoteTerminalOp: (projectName, op, id, label, order) =>
    set((s) => ({
      selected: projectName,
      view: "projects",
      visited: new Set([...s.visited, projectName]),
      pendingRemoteTerminalOp: {
        projectName,
        op,
        id,
        label,
        order,
        nonce: ++remoteRequestNonce,
      },
    })),

  clearPendingRemoteTerminalOp: () => set({ pendingRemoteTerminalOp: null }),

  pendingAdoptTerminal: null,

  adoptRemoteTerminal: (projectName, id, label, opts) => {
    const s = get();
    const mounted =
      s.visited.has(projectName) ||
      s.selected === projectName ||
      s.detached.has(projectName);
    if (mounted) {
      set({
        pendingAdoptTerminal: {
          projectName,
          id,
          label,
          startCmd: opts?.startCmd,
          resumeCmd: opts?.resumeCmd,
          actionName: opts?.actionName,
          nonce: ++remoteRequestNonce,
        },
      });
      return;
    }
    void appendPersistedTab(projectName, {
      id,
      label,
      ...(opts?.startCmd ? { startCmd: opts.startCmd } : {}),
      ...(opts?.resumeCmd ? { resumeCmd: opts.resumeCmd } : {}),
      ...(opts?.actionName ? { actionName: opts.actionName } : {}),
    });
  },

  clearPendingAdoptTerminal: () => set({ pendingAdoptTerminal: null }),

  pendingRemoveTerminal: null,

  removeRemoteTerminal: (id) => {
    // A parked (unmounted) tab lives in the persisted cache tagged with its pty
    // id — drop it there. If nothing matched, a mounted project may hold it live,
    // so broadcast a remove op the mounted ProjectDetail(s) resolve against their
    // tree (unknown ids no-op there).
    if (removePersistedTabById(id)) return;
    set({ pendingRemoveTerminal: { id, nonce: ++remoteRequestNonce } });
  },

  clearPendingRemoveTerminal: () => set({ pendingRemoveTerminal: null }),

  runGenerator: async ({ folder, name, spec }) => {
    try {
      await CreateProject(name, folder);
      await get().refreshProjects();
      set({
        selected: name,
        view: "projects",
        addProjectPickerOpen: false,
        pendingGeneratorRun: { projectName: name, spec },
      });
    } catch (err) {
      toast.error(`Failed to create project: ${err}`);
    }
  },

  closeSSHModal: () => set({ sshModalOpen: false }),

  openAddCloneModal: () => set({ cloneModalOpen: true }),

  closeAddCloneModal: () => set({ cloneModalOpen: false, addProjectTarget: null }),

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
    const target = get().addProjectTarget;
    set({ addingCloneProject: true });
    try {
      if (target) {
        // Remote clone: the host runs it on a background thread (it can outlast
        // the peer dispatch timeout) and reports the result via `clone-done`.
        const prefixed = prefixName(target.slug, name);
        const waiter = waitForRemoteClone(prefixed, target.slug);
        try {
          await StartCloneProject(name, url, branch, prefixRoot(target.slug, destParent));
        } catch (err) {
          waiter.cancel();
          throw err;
        }
        await waiter.promise;
        await get().refreshProjects();
        set({
          selected: prefixed,
          view: "projects",
          cloneModalOpen: false,
          addProjectTarget: null,
        });
        toast.success(`Cloned ${name} on ${target.alias}`);
      } else {
        await CreateProjectFromClone(name, url, branch, destParent);
        await get().refreshProjects();
        set({
          selected: name,
          view: "projects",
          cloneModalOpen: false,
        });
        toast.success(`Cloned ${name}`);
      }
    } catch (err) {
      // A dropped peer surfaces as a toast (the modal error line covers clone
      // failures); rethrow so the modal clears its busy state and shows it too.
      if (err instanceof LostPeerError) toast.error(err.message);
      throw err;
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
    const tasksPerCopy = opts.tasksPerCopy ?? [];
    set((s) => ({ duplicatingNames: [...s.duplicatingNames, name] }));
    const noun = (n: number) => (n === 1 ? "copy" : "copies");
    const toastId = toast.loading(`Creating ${count} ${noun(count)} of ${name}…`);
    const created: string[] = [];
    const createdLocal: string[] = [];
    // A peer-hosted source clones on that host's background thread (a large copy
    // can outlast the peer dispatch timeout): reserve the copy name, then wait
    // for its `duplicate-done` before moving on. Local sources duplicate inline.
    // Every needed collector is armed up front, before any start call — the peer
    // event tap installs via an async listen(), so arming one just before its
    // start call could still drop a fast duplicate's event.
    const sourceAt = (i: number) => opts.targetsPerCopy?.[i] || name;
    const copyArgs = (i: number) =>
      [
        (opts.labels?.[i] ?? "").trim(),
        opts.excludeUncommitted ?? false,
        opts.reinstallDeps ?? false,
        opts.pullLatest ?? true,
      ] as const;
    const collectors = new Map<string, ReturnType<typeof collectRemoteDuplicates>>();
    for (let i = 0; i < count; i++) {
      const slug = peerSlugOf(sourceAt(i));
      if (slug && !collectors.has(slug)) collectors.set(slug, collectRemoteDuplicates(slug));
    }
    // A host running an older build rejects the async start command; fall back
    // to the synchronous duplicate for the rest of the batch. Matched narrowly
    // (command name + Tauri's unknown-command shape) so real duplicate failures
    // still surface.
    let legacyPeerDuplicate = false;
    const isMissingStartCommand = (err: unknown) => {
      const msg = String(err);
      return msg.includes("start_duplicate_project") && /not found/i.test(msg);
    };
    try {
      // Create copies one at a time so each can start working the moment it's
      // ready, instead of waiting for the whole batch. After each copy: queue
      // its tasks, refresh so it (with its actions) enters the list, then mark
      // it visited — that mounts its detail and fires the auto-run effect.
      for (let i = 0; i < count; i++) {
        const source = sourceAt(i);
        const slug = peerSlugOf(source);
        let newName: string | null;
        try {
          if (slug && !legacyPeerDuplicate) {
            try {
              const prefixed = await StartDuplicateProject(source, ...copyArgs(i));
              await collectors.get(slug)!.wait(prefixed);
              newName = prefixed;
            } catch (err) {
              if (!isMissingStartCommand(err)) throw err;
              legacyPeerDuplicate = true;
              newName = await DuplicateProject(source, ...copyArgs(i));
            }
          } else {
            newName = await DuplicateProject(source, ...copyArgs(i));
          }
        } catch (err) {
          if (created.length === 0) throw err;
          break;
        }
        if (!newName) break;
        const copyName = newName;
        created.push(copyName);
        if (!slug) createdLocal.push(copyName);
        const tasks = tasksPerCopy[i] ?? [];
        if (tasks.length > 0) {
          set((s) => ({
            spawnTasks: {
              ...s.spawnTasks,
              [copyName]: { tasks, nonce: ++spawnTaskNonce },
            },
          }));
        }
        await get().refreshProjects();
        get().markVisited(copyName);
        if (created.length === 1) set({ selected: copyName, view: "projects" });
      }
      // Grouping mutates the LOCAL sidebar layout/groups; peer projects live in
      // their own flat section (groups are local-only), so only the copies
      // created on this Mac are grouped — a host groups its own.
      const folderName = opts.groupName?.trim();
      if (folderName && createdLocal.length > 0) {
        try {
          let layout: SidebarLayout = { order: get().sidebarOrder, groups: get().groups };
          let group =
            layout.groups.find((g) => g.name.trim() === folderName) ??
            layout.groups.find(
              (g) => g.name.trim().toLowerCase() === folderName.toLowerCase(),
            );
          if (!group) {
            group = { id: crypto.randomUUID(), name: folderName, members: [] };
            // Drop the new folder directly below the local project the copies
            // came from, not at the bottom of the sidebar.
            const anchor =
              Array.from({ length: count }, (_, i) => sourceAt(i)).find(
                (s) => !isPeerName(s),
              ) ?? name;
            const atIndex = topLevelIndexOfProject(layout, anchor) + 1;
            layout = addGroupToLayout(layout, group, atIndex);
          }
          for (const copyName of createdLocal) layout = moveIntoGroup(layout, copyName, group.id);
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
      for (const collector of collectors.values()) collector.dispose();
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

  // Queue a task to run in a project and mount it so the auto-run effect fires —
  // the seam the CLI and mobile app use to run a task in a project (fresh copy or
  // already open). Appends when a prior queue hasn't been consumed yet so a
  // second `run` before the effect drains isn't lost; consuming clears the entry.
  queueSpawnTask: (name, task) => {
    set((s) => {
      const existing = s.spawnTasks[name];
      const tasks = existing ? [...existing.tasks, task] : [task];
      return {
        spawnTasks: { ...s.spawnTasks, [name]: { tasks, nonce: ++spawnTaskNonce } },
      };
    });
    get().markVisited(name);
  },

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

  removeProjectFromDisk: (name) =>
    runProjectRemoval(
      set,
      get,
      name,
      [name, ...get().projects.filter((p) => p.parentName === name).map((p) => p.name)],
      () => TrashProject(name),
    ),

  // Returns the names actually removed, so callers (e.g. deleteGroup) can tell a
  // partial/no-op run from a complete one.
  removeProjectsBatch: async (names) => {
    if (names.length === 0 || names.some((n) => get().removingNames.has(n)))
      return [];
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
      return removed;
    } catch (err) {
      toast.error(`Failed to remove projects: ${err}`);
      return [];
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

  moveProjectRoot: async (name, newRoot) => {
    try {
      await MoveProjectRoot(name, newRoot);
      await get().refreshProjects();
    } catch (err) {
      toast.error(`Failed to move ${name}: ${err}`);
      throw err;
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
    const projects = get().projects;
    const byName = projectsByName(projects);
    const current: SidebarLayout = { order: get().sidebarOrder, groups: get().groups };
    const seeds = (opts.initialMembers ?? [])
      .map((n) => resolveMemberName(projects, n))
      .filter((n): n is string => Boolean(n));
    // Drop the new folder where its first seed sat so it keeps its place
    // instead of landing at the end of the list.
    const atIndex = seeds.length ? projectAnchorIndex(current, byName, seeds[0]) : undefined;
    let next = addGroupToLayout(current, { id, name: trimmed, members: [] }, atIndex);
    for (const seed of seeds) next = moveIntoGroup(next, seed, id);
    await get().applySidebarLayout(next);
  },

  renameGroup: async (id, name) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const current: SidebarLayout = { order: get().sidebarOrder, groups: get().groups };
    await get().applySidebarLayout(renameGroupInLayout(current, id, trimmed));
  },

  // Deleting a folder deletes everything inside it: each member, plus the
  // duplicates of any member original (a duplicate's copy is removed from disk,
  // an original only loses its lpm entry). The now-empty folder is then dropped.
  deleteGroup: async (id) => {
    const group = get().groups.find((g) => g.id === id);
    if (!group) return;
    const projects = get().projects;
    const byName = projectsByName(projects);
    const names = expandRemovalSet(projects, byName, group.members).map((p) => p.name);
    if (names.length > 0) {
      const removed = await get().removeProjectsBatch(names);
      // A partial/no-op removal (e.g. a member was mid-delete) would leave
      // survivors behind; keep the folder so its contents stay visible rather
      // than silently spilling un-deleted projects to the top level.
      if (removed.length < names.length) return;
    }
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
    await get().moveProjectsToGroup([name], groupId);
  },

  moveProjectsToGroup: async (names, groupId) => {
    const projects = get().projects;
    const byName = projectsByName(projects);
    let layout: SidebarLayout = { order: get().sidebarOrder, groups: get().groups };
    const membership = membershipMap(layout.groups);
    let changed = false;
    for (const name of names) {
      const target = resolveMemberName(projects, name);
      if (!target) continue;
      if (groupId === null) {
        // Only true folder members move out; a loose project would otherwise be
        // detached and re-appended at the end, losing its position.
        if (!membership.has(target)) continue;
        layout = moveOutOfGroup(layout, target, layout.order.length);
      } else {
        layout = moveIntoGroup(layout, target, groupId, dupInsertIndex(layout, byName, target, groupId));
      }
      changed = true;
    }
    if (changed) await get().applySidebarLayout(layout);
  },

  refreshDetached: async () => {
    try {
      const raw = (await ListDetachedProjects()) as string[] | null;
      const next = new Set<string>(raw ?? []);
      // Every detached project must stay marked visited so the main window (the
      // terminals' owner) keeps its ProjectDetail mounted even when unselected.
      // Windows restored at launch reach the store only through this path — not
      // detachProject — so without this a restored detached window's close would
      // unmount the owner and StopTerminal-kill the project's live PTYs.
      for (const name of next) get().markVisited(name);
      set((s) => {
        if (s.detached.size === next.size && [...s.detached].every((n) => next.has(n))) {
          return s;
        }
        return { detached: next };
      });
    } catch (err) {
      reportError("detached.refresh_failed", err);
    }
  },

  detachProject: async (name) => {
    try {
      await DetachProject(name);
      // Mark visited so the main window keeps this project's ProjectDetail
      // mounted (as the terminals' owner) even when it isn't selected — and so
      // closing the detached window later doesn't unmount + kill the live PTYs
      // the user never selected it inline.
      get().markVisited(name);
      set((s) => {
        if (s.detached.has(name)) return s;
        // Keep the project selected in the main window: the main window stays
        // the owner of its live terminals, and the detached window opens as a
        // co-interactive mirror of them — the project is now live in both.
        return { detached: new Set<string>([...s.detached, name]) };
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
      reportError("detached.focus_failed", err, { project: name });
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

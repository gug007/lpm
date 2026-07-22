import { LoadTerminals, SaveTerminals } from "../bridge/commands";
import { main } from "../bridge/models";

export interface PersistedTab {
  label: string;
  // Stable per-terminal id for message-history scoping; survives restart.
  historyKey?: string;
  startCmd?: string;
  resumeCmd?: string;
  actionName?: string;
  pinned?: boolean;
  emoji?: string;
  color?: string;
  // Live pty id, stored ONLY for a peer-adopted tab parked while its project is
  // unmounted, so a later peer-close can find and drop it. Ignored on restore
  // (the tab relaunches with a fresh pty); normal persistence never sets it.
  id?: string;
}

// Mirrors the Go binding (main.PaneNode) so it round-trips through the
// binding layer without type contortions.
export interface PersistedPaneNode {
  kind: string;
  // leaf
  tabs?: PersistedTab[];
  activeTabIdx?: number;
  activeServiceName?: string;
  // split
  direction?: string;
  ratio?: number;
  a?: PersistedPaneNode;
  b?: PersistedPaneNode;
}

// Legacy terminal entry — kept only so `useTerminals` can migrate old
// persisted data into the new pane tree model on load.
export interface PersistedTerminalEntry {
  label: string;
  startCmd?: string;
  resumeCmd?: string;
}

export interface PersistedHistoryEntry {
  label: string;
  startCmd?: string;
  resumeCmd: string;
  actionName?: string;
  closedAt: number;
}

export interface ProjectTerminalState {
  detailView: string;
  activeTab?: string;
  panes?: PersistedPaneNode;
  focusedPanePath?: number[];
  // Legacy field — read on load for migration, never written back.
  terminals?: PersistedTerminalEntry[];
  history?: PersistedHistoryEntry[];
}

export const TERMINAL_HISTORY_CAP = 20;

// Reserved projectName for the global terminals pane tree. Mirrors
// GlobalProjectName in internal/config — both must stay in sync.
export const GLOBAL_TERMINALS_KEY = "__global__";

export interface TerminalsConfig {
  projects: Record<string, ProjectTerminalState>;
}

let cached: TerminalsConfig = { projects: {} };

export async function loadTerminals(): Promise<TerminalsConfig> {
  try {
    const c = await LoadTerminals();
    cached = c?.projects ? c : { projects: {} };
  } catch {
    cached = { projects: {} };
  }
  return cached;
}

export function getProjectTerminals(projectName: string): ProjectTerminalState {
  return cached.projects[projectName] ?? { detailView: "terminal" };
}

// Seeds the terminal count before the async restore reifies the tree.
// Without this, callers fall back to the legacy `terminals[]` field and
// miss new-format data.
export function countPersistedTabs(node: PersistedPaneNode | undefined): number {
  if (!node) return 0;
  if (node.kind === "leaf") return node.tabs?.length ?? 0;
  return countPersistedTabs(node.a) + countPersistedTabs(node.b);
}

export async function saveProjectTerminals(
  projectName: string,
  state: ProjectTerminalState,
): Promise<void> {
  cached = {
    ...cached,
    projects: { ...cached.projects, [projectName]: state },
  };
  await SaveTerminals(main.TerminalsConfig.createFrom(cached));
}

// Stages a change in memory so a follow-up persist() in the same code
// path flushes it alongside its own write instead of two back-to-back.
export function updateProjectTerminalsCache(
  projectName: string,
  next: ProjectTerminalState,
): void {
  cached = {
    ...cached,
    projects: { ...cached.projects, [projectName]: next },
  };
}

// The backend deletes the persisted entry when it removes the project; this
// drops it from the in-memory cache so the next saveProjectTerminals call
// doesn't write it back.
export function forgetProjectTerminals(projectName: string): void {
  if (!(projectName in cached.projects)) return;
  const { [projectName]: _removed, ...rest } = cached.projects;
  cached = { ...cached, projects: rest };
}

function appendTabToPersistedTree(
  node: PersistedPaneNode | undefined,
  tab: PersistedTab,
): PersistedPaneNode {
  if (!node) return { kind: "leaf", tabs: [tab], activeTabIdx: 0 };
  if (node.kind === "leaf") return { ...node, tabs: [...(node.tabs ?? []), tab] };
  return { ...node, a: appendTabToPersistedTree(node.a, tab) };
}

// Park a tab in a project's persisted tree while it isn't mounted, so it shows
// up when the host opens the project. A generic label is filled in from the tab
// count when none is given. The tab keeps its pty `id` so a peer-close can find
// it (opening the project relaunches with a fresh pty either way).
export async function appendPersistedTab(
  projectName: string,
  tab: PersistedTab,
): Promise<void> {
  const state = getProjectTerminals(projectName);
  const label = tab.label || `Terminal ${countPersistedTabs(state.panes) + 1}`;
  const panes = appendTabToPersistedTree(state.panes, { ...tab, label });
  await saveProjectTerminals(projectName, { ...state, panes, terminals: undefined });
}

function removeTabByIdFromTree(
  node: PersistedPaneNode,
  id: string,
): { node: PersistedPaneNode | undefined; removed: boolean } {
  if (node.kind === "leaf") {
    const tabs = node.tabs ?? [];
    const idx = tabs.findIndex((t) => t.id === id);
    if (idx === -1) return { node, removed: false };
    const nextTabs = tabs.filter((_, i) => i !== idx);
    if (nextTabs.length === 0 && !node.activeServiceName) return { node: undefined, removed: true };
    const activeTabIdx = Math.max(0, Math.min(node.activeTabIdx ?? 0, nextTabs.length - 1));
    return { node: { ...node, tabs: nextTabs, activeTabIdx }, removed: true };
  }
  const a = node.a ? removeTabByIdFromTree(node.a, id) : { node: undefined, removed: false };
  if (a.removed) return { node: a.node ? { ...node, a: a.node } : node.b, removed: true };
  const b = node.b ? removeTabByIdFromTree(node.b, id) : { node: undefined, removed: false };
  if (b.removed) return { node: b.node ? { ...node, b: b.node } : node.a, removed: true };
  return { node, removed: false };
}

// Inverse of appendPersistedTab: drop the parked tab carrying `id` from whichever
// project's persisted tree holds it (collapsing an emptied split). Returns
// whether a tab was removed — false means no parked tab matched (it may be live
// in a mounted project, or unknown). Only peer-parked tabs carry an id, so at
// most one match exists.
export function removePersistedTabById(id: string): boolean {
  for (const [projectName, state] of Object.entries(cached.projects)) {
    if (!state.panes) continue;
    const result = removeTabByIdFromTree(state.panes, id);
    if (result.removed) {
      void saveProjectTerminals(projectName, {
        ...state,
        panes: result.node,
        terminals: undefined,
      });
      return true;
    }
  }
  return false;
}

export function appendHistoryEntry(
  state: ProjectTerminalState,
  entry: PersistedHistoryEntry,
): ProjectTerminalState {
  const existing = state.history ?? [];
  const filtered = existing.filter((h) => h.resumeCmd !== entry.resumeCmd);
  const next = [entry, ...filtered].slice(0, TERMINAL_HISTORY_CAP);
  return { ...state, history: next };
}

export function removeHistoryEntry(
  state: ProjectTerminalState,
  resumeCmd: string,
): ProjectTerminalState {
  const existing = state.history ?? [];
  const next = existing.filter((h) => h.resumeCmd !== resumeCmd);
  if (next.length === existing.length) return state;
  return { ...state, history: next };
}

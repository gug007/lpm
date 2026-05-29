import { LoadTerminals, SaveTerminals } from "../bridge/commands";
import { main } from "../bridge/models";

export interface PersistedTab {
  label: string;
  startCmd?: string;
  resumeCmd?: string;
  actionName?: string;
  pinned?: boolean;
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

// Without this, the next saveProjectTerminals call would write the
// whole cache back and resurrect the deleted entry.
export function forgetProjectTerminals(projectName: string): void {
  if (!(projectName in cached.projects)) return;
  const { [projectName]: _removed, ...rest } = cached.projects;
  cached = { ...cached, projects: rest };
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

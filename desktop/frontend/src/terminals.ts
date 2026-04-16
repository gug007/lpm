import { LoadTerminals, SaveTerminals } from "../wailsjs/go/main/App";
import { main } from "../wailsjs/go/models";

// Persisted tab (one terminal inside a pane) — labels and optional
// startCmd/resumeCmd so restore can re-inject them after a restart.
export interface PersistedTab {
  id: string;
  label: string;
  startCmd?: string;
  resumeCmd?: string;
  actionName?: string;
}

// Persisted pane tree shape — mirrors the Go binding (main.PaneNode) so
// it can round trip through the wails layer without type contortions.
// Leaf nodes hold `tabs[]` + `activeTabIdx`; split nodes hold
// `direction`/`ratio`/`a`/`b`.
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

export interface ProjectTerminalState {
  detailView: string;
  activeTab?: string;
  panes?: PersistedPaneNode;
  focusedPanePath?: number[];
  // Legacy field — read on load for migration, never written back.
  terminals?: PersistedTerminalEntry[];
}

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

// Without this, the next saveProjectTerminals call would write the
// whole cache back and resurrect the deleted entry.
export function forgetProjectTerminals(projectName: string): void {
  if (!(projectName in cached.projects)) return;
  const { [projectName]: _removed, ...rest } = cached.projects;
  cached = { ...cached, projects: rest };
}

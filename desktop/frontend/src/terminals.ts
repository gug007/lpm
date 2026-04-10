import { LoadTerminals, SaveTerminals } from "../wailsjs/go/main/App";
import { main } from "../wailsjs/go/models";

export interface TerminalEntry {
  label: string;
  startCmd?: string;
  resumeCmd?: string;
}

export interface ProjectTerminalState {
  detailView: string;
  activeTab?: string;
  terminals?: TerminalEntry[];
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

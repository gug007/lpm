import { useAppStore } from "./store/app";
import { useGlobalAgentStatus } from "./store/globalAgentStatus";
import { GLOBAL_TERMINALS_KEY } from "./terminals";
import type { StatusEntry } from "./types";

// The status rows a project's agents report right now, read outside React.
export function projectStatusEntries(projectName: string): StatusEntry[] | undefined {
  return projectName === GLOBAL_TERMINALS_KEY
    ? useGlobalAgentStatus.getState().entries
    : useAppStore.getState().projects.find((p) => p.name === projectName)?.statusEntries;
}

// The same rows, null when nothing says what the project's agents are doing: its
// computer dropped off, or isn't answering.
export function knownStatusEntries(projectName: string): StatusEntry[] | null {
  if (projectName === GLOBAL_TERMINALS_KEY) return useGlobalAgentStatus.getState().entries;
  const project = useAppStore.getState().projects.find((p) => p.name === projectName);
  return project && !project.statusUnknown ? (project.statusEntries ?? []) : null;
}

export async function refreshStatusEntries(projectName: string): Promise<void> {
  if (projectName === GLOBAL_TERMINALS_KEY) await useGlobalAgentStatus.getState().refresh();
  else await useAppStore.getState().refreshProjects();
}

// Runs `changed` whenever any project's status rows may be different.
export function onStatusEntriesChange(changed: () => void): () => void {
  const offProjects = useAppStore.subscribe((s, prev) => {
    if (s.projects !== prev.projects) changed();
  });
  const offTerminals = useGlobalAgentStatus.subscribe((s, prev) => {
    if (s.entries !== prev.entries) changed();
  });
  return () => {
    offProjects();
    offTerminals();
  };
}

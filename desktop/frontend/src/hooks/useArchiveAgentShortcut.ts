import { ARCHIVE_AGENT_CHORD, archiveAgents } from "../agentArchive";
import type { SidebarAgentRow } from "../sidebarAgents";
import { canArchive } from "../sidebarSeenAgents";
import { useTerminalTitles } from "../store/terminalTitles";
import { useKeyboardShortcut } from "./useKeyboardShortcut";

/** ⌘⇧A: archive the agent whose tab is on screen, once its turn has ended. */
export function useArchiveAgentShortcut(
  agentsByProject: Map<string, SidebarAgentRow[]>,
  project: string | null,
) {
  useKeyboardShortcut(
    ARCHIVE_AGENT_CHORD,
    () => {
      if (!project) return;
      const terminalId = useTerminalTitles.getState().onScreenByProject[project];
      const row = terminalId ? agentsByProject.get(project)?.find((r) => r.terminalId === terminalId) : undefined;
      if (row && canArchive(row)) archiveAgents(project, [row]);
    },
    project !== null,
  );
}

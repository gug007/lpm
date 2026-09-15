import { create } from "zustand";
import { GetProject } from "../../bridge/commands";
import { GLOBAL_TERMINALS_KEY } from "../terminals";
import type { ProjectInfo, StatusEntry } from "../types";

// Status rows for agents running in the global Terminals tabs. The backend
// files them under the reserved project key, which is not in the project list
// the app syncs, so they need a fetch of their own — shared here between the
// Terminals view, which paints its tabs from them, and the sidebar row, which
// paints its name.
interface GlobalAgentStatusState {
  entries: StatusEntry[];
  refresh: () => Promise<void>;
}

export const useGlobalAgentStatus = create<GlobalAgentStatusState>((set) => ({
  entries: [],

  refresh: async () => {
    try {
      const info: ProjectInfo | null = await GetProject(GLOBAL_TERMINALS_KEY);
      set({ entries: info?.statusEntries ?? [] });
    } catch {
      /* the reserved project always resolves; a failed read keeps the last rows */
    }
  },
}));

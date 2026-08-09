import { create } from "zustand";

// A project shows its agents unless the user closed that row, so what persists
// is the exceptions — the rows they collapsed.
const STORAGE_KEY = "lpm-sidebar-collapsed-projects";

function parseCollapsed(raw: string | null): Set<string> {
  if (!raw) return new Set();
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((name): name is string => typeof name === "string"));
  } catch {
    return new Set();
  }
}

function readCollapsedProjects(): Set<string> {
  if (typeof localStorage === "undefined") return new Set();
  return parseCollapsed(localStorage.getItem(STORAGE_KEY));
}

function writeCollapsedProjects(names: Set<string>): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...names]));
  } catch {
    /* storage may be full or disabled */
  }
}

interface CollapsedAgentsState {
  collapsed: Set<string>;
  toggle: (projectName: string) => void;
}

/** Which project rows are holding their agents closed, seeded from the window
 *  the user last left. One store rather than state per row: a local project and
 *  a paired host's project render in different trees but persist to the same
 *  set, and two copies of it would each drop the other's names on write. */
export const useCollapsedAgents = create<CollapsedAgentsState>((set) => ({
  collapsed: readCollapsedProjects(),

  toggle: (projectName) =>
    set((s) => {
      const collapsed = new Set(s.collapsed);
      if (!collapsed.delete(projectName)) collapsed.add(projectName);
      writeCollapsedProjects(collapsed);
      return { collapsed };
    }),
}));

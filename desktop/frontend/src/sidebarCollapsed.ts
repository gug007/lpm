import { create } from "zustand";

// A project shows its agents unless the user closed that row, and deals out its
// duplicates unless the user gathered them back into their deck. Both persist
// the exceptions — what was collapsed — so a fresh project behaves the same way
// on every machine the settings land on.
const AGENTS_KEY = "lpm-sidebar-collapsed-projects";
const DECKS_KEY = "lpm-sidebar-collapsed-decks";

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

function readCollapsed(key: string): Set<string> {
  if (typeof localStorage === "undefined") return new Set();
  return parseCollapsed(localStorage.getItem(key));
}

function writeCollapsed(key: string, names: Set<string>): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify([...names]));
  } catch {
    /* storage may be full or disabled */
  }
}

interface CollapsedState {
  collapsed: Set<string>;
  toggle: (projectName: string) => void;
}

/** One store per concern rather than state per row: a local project and a
 *  paired host's project render in different trees but persist to the same set,
 *  and two copies of it would each drop the other's names on write. */
function collapsedStore(key: string) {
  return create<CollapsedState>((set) => ({
    collapsed: readCollapsed(key),

    toggle: (projectName) =>
      set((s) => {
        const collapsed = new Set(s.collapsed);
        if (!collapsed.delete(projectName)) collapsed.add(projectName);
        writeCollapsed(key, collapsed);
        return { collapsed };
      }),
  }));
}

/** Which project rows are holding their agents closed. */
export const useCollapsedAgents = collapsedStore(AGENTS_KEY);

/** Keyed on the parent's name — the key the tree memo groups children by. */
export const useCollapsedDecks = collapsedStore(DECKS_KEY);

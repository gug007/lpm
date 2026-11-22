import { create } from "zustand";

// Each project's tab names as its tab strip last showed them, kept across
// restarts. Only a project open in this window publishes live names
// (terminalTitles.ts), so a project on a server that went away, or one not
// opened since lpm started, would otherwise name its agents only "Claude Code".
// A project on another computer has that computer in its name, so its names
// are kept apart from a same-named project here.

const STORAGE_KEY = "lpm.tabTitles";

type Titles = Record<string, Record<string, string>>;

function load(): Titles {
  try {
    if (typeof localStorage === "undefined") return {};
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function save(titles: Titles): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(titles));
  } catch {
    // ignore storage failures (private mode, quota)
  }
}

// Order counts: a dragged tab keeps every name and only moves the keys, and the
// sidebar reads its order from them.
export function sameTitles(a: Record<string, string> | undefined, b: Record<string, string>): boolean {
  if (!a) return false;
  const keys = Object.keys(a);
  const others = Object.keys(b);
  return keys.length === others.length && keys.every((k, i) => k === others[i] && a[k] === b[k]);
}

interface SavedTabTitlesState {
  byProject: Titles;
  // A project that is restoring its tabs shows none for a moment; that isn't
  // the list to remember.
  remember: (project: string, titles: Record<string, string>) => void;
}

export const useSavedTabTitles = create<SavedTabTitlesState>((set, get) => ({
  byProject: load(),
  remember: (project, titles) => {
    if (Object.keys(titles).length === 0) return;
    const current = get().byProject;
    if (sameTitles(current[project], titles)) return;
    const byProject = { ...current, [project]: titles };
    save(byProject);
    set({ byProject });
  },
}));

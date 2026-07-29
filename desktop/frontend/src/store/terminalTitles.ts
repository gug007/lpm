import { create } from "zustand";

// The name a terminal tab is showing (its agent session title once one lands,
// otherwise its label), published by every mounted project so views outside
// that project — Activity — can name the session a status belongs to.
interface TerminalTitlesState {
  byProject: Record<string, Record<string, string>>;
  setProjectTitles: (project: string, titles: Record<string, string>) => void;
  clearProjectTitles: (project: string) => void;
}

function same(a: Record<string, string>, b: Record<string, string>): boolean {
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  return keys.every((key) => a[key] === b[key]);
}

export const useTerminalTitles = create<TerminalTitlesState>((set) => ({
  byProject: {},

  setProjectTitles: (project, titles) =>
    set((s) => {
      const prev = s.byProject[project];
      if (prev && same(prev, titles)) return s;
      return { byProject: { ...s.byProject, [project]: titles } };
    }),

  clearProjectTitles: (project) =>
    set((s) => {
      if (!(project in s.byProject)) return s;
      const { [project]: _gone, ...rest } = s.byProject;
      return { byProject: rest };
    }),
}));

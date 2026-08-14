import { create } from "zustand";

// What each mounted project's tab strip is showing, published for the views
// outside it — Activity, the sidebar — that have no tree of their own to read:
// the name of every tab, and which one the user is looking at.
//
// Names are the tab's agent session title once one lands, otherwise its label,
// keyed in tab order: the sidebar lists a project's agents the way its tab strip
// reads, and takes that order from these keys.
interface TerminalTitlesState {
  byProject: Record<string, Record<string, string>>;
  // The focused pane's active terminal, per project. Null while that pane shows
  // a service log or has no tabs. Every mounted project publishes one, open or
  // not, so a reader that means "the tab on screen" has to check the project is
  // the selected one first.
  focusedByProject: Record<string, string | null>;
  setProjectTitles: (project: string, titles: Record<string, string>) => void;
  setProjectFocus: (project: string, terminalId: string | null) => void;
  clearProject: (project: string) => void;
}

// Order counts: dragging a tab leaves every name untouched and only moves the
// keys, and the sidebar reads its order from them.
function same(a: Record<string, string>, b: Record<string, string>): boolean {
  const keys = Object.keys(a);
  const others = Object.keys(b);
  if (keys.length !== others.length) return false;
  return keys.every((key, i) => key === others[i] && a[key] === b[key]);
}

export const useTerminalTitles = create<TerminalTitlesState>((set) => ({
  byProject: {},
  focusedByProject: {},

  setProjectTitles: (project, titles) =>
    set((s) => {
      const prev = s.byProject[project];
      if (prev && same(prev, titles)) return s;
      return { byProject: { ...s.byProject, [project]: titles } };
    }),

  setProjectFocus: (project, terminalId) =>
    set((s) => {
      if (s.focusedByProject[project] === terminalId) return s;
      return { focusedByProject: { ...s.focusedByProject, [project]: terminalId } };
    }),

  clearProject: (project) =>
    set((s) => {
      if (!(project in s.byProject) && !(project in s.focusedByProject)) return s;
      const { [project]: _names, ...byProject } = s.byProject;
      const { [project]: _focus, ...focusedByProject } = s.focusedByProject;
      return { byProject, focusedByProject };
    }),
}));

import { create } from "zustand";
import { sameTitles, useSavedTabTitles } from "./savedTabTitles";

// What each mounted project's tab strip is showing, published for the sidebar,
// which has no tree of its own to read: the name of every tab, and which one
// the user is looking at.
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
  // That same terminal while the project's terminals are actually in view, else
  // null: the one tab a person can be looking at right now.
  onScreenByProject: Record<string, string | null>;
  setProjectTitles: (project: string, titles: Record<string, string>) => void;
  setProjectFocus: (project: string, terminalId: string | null, onScreen: boolean) => void;
  clearProject: (project: string) => void;
}

export const useTerminalTitles = create<TerminalTitlesState>((set) => ({
  byProject: {},
  focusedByProject: {},
  onScreenByProject: {},

  setProjectTitles: (project, titles) => {
    useSavedTabTitles.getState().remember(project, titles);
    set((s) => {
      const prev = s.byProject[project];
      if (sameTitles(prev, titles)) return s;
      return { byProject: { ...s.byProject, [project]: titles } };
    });
  },

  setProjectFocus: (project, terminalId, onScreen) =>
    set((s) => {
      const shown = onScreen ? terminalId : null;
      const focusSame = s.focusedByProject[project] === terminalId;
      const shownSame = s.onScreenByProject[project] === shown;
      if (focusSame && shownSame) return s;
      return {
        focusedByProject: focusSame ? s.focusedByProject : { ...s.focusedByProject, [project]: terminalId },
        onScreenByProject: shownSame ? s.onScreenByProject : { ...s.onScreenByProject, [project]: shown },
      };
    }),

  clearProject: (project) =>
    set((s) => {
      if (!(project in s.byProject) && !(project in s.focusedByProject)) return s;
      const { [project]: _names, ...byProject } = s.byProject;
      const { [project]: _focus, ...focusedByProject } = s.focusedByProject;
      const { [project]: _shown, ...onScreenByProject } = s.onScreenByProject;
      return { byProject, focusedByProject, onScreenByProject };
    }),
}));

// A project's tab names: live while it is open in this window, else as it last
// showed them.
export function knownTabTitles(project: string): Record<string, string> | undefined {
  return useTerminalTitles.getState().byProject[project] ?? useSavedTabTitles.getState().byProject[project];
}

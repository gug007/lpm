import { useEffect } from "react";
import { create } from "zustand";

// Each mounted project's Claude tabs that lpm can move to another account, in
// tab-strip order, with the one selected in its focused pane (null when that
// isn't one of them) and the ones Claude is working in. Published for the
// sidebar's account menus, which offer to move them along with a new pick.
export interface ProjectClaudeTabs {
  ids: string[];
  selected: string | null;
  working: string[];
}

interface ProjectClaudeTabsState {
  byProject: Record<string, ProjectClaudeTabs>;
}

export const useProjectClaudeTabs = create<ProjectClaudeTabsState>(() => ({ byProject: {} }));

export function usePublishProjectClaudeTabs(projectName: string, tabs: ProjectClaudeTabs): void {
  const key = JSON.stringify(tabs);

  useEffect(() => {
    const next: ProjectClaudeTabs = JSON.parse(key);
    useProjectClaudeTabs.setState((s) =>
      JSON.stringify(s.byProject[projectName]) === key ? s : { byProject: { ...s.byProject, [projectName]: next } },
    );
  }, [projectName, key]);

  useEffect(
    () => () =>
      useProjectClaudeTabs.setState((s) => {
        if (!(projectName in s.byProject)) return s;
        const { [projectName]: _gone, ...byProject } = s.byProject;
        return { byProject };
      }),
    [projectName],
  );
}

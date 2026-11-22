import { useTabHistory } from "./store/tabHistory";
import { useTerminalTargets } from "./store/terminalTargets";
import { useTerminalTitles } from "./store/terminalTitles";

// Records each tab as it comes on screen, in any project, on any computer, or in
// the standalone Terminals. A tab counts again each time it comes back into view,
// so the history reads in the order the user moved between tabs.
export function startTabHistory(): () => void {
  const shown: Record<string, string | null> = {};

  const check = () => {
    const onScreen = useTerminalTitles.getState().onScreenByProject;
    const targets = useTerminalTargets.getState().byProject;
    const history = useTabHistory.getState();
    for (const project of Object.keys(shown)) {
      if (!onScreen[project]) shown[project] = null;
    }
    for (const [project, id] of Object.entries(onScreen)) {
      if (!id || shown[project] === id) continue;
      const tab = targets[project]?.find((t) => t.id === id);
      if (!tab?.historyKey) continue;
      shown[project] = id;
      history.visit({ project, key: tab.historyKey, label: tab.label });
    }
  };

  const relabel = () => {
    const targets = useTerminalTargets.getState().byProject;
    const { relabel: apply } = useTabHistory.getState();
    for (const [project, tabs] of Object.entries(targets)) {
      apply(project, Object.fromEntries(tabs.map((t) => [t.historyKey, t.label])));
    }
  };

  check();
  const stopTitles = useTerminalTitles.subscribe(check);
  const stopTargets = useTerminalTargets.subscribe(() => {
    check();
    relabel();
  });
  return () => {
    stopTitles();
    stopTargets();
  };
}

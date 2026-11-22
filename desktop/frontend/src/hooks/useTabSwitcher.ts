import { useEffect, useRef, useState } from "react";
import { useTabHistory, type TabVisit } from "../store/tabHistory";
import { useTerminalTargets } from "../store/terminalTargets";
import { useTerminalTitles } from "../store/terminalTitles";
import { buildTabSwitchList, cycleIndex, firstIndex } from "../tabSwitcher";

interface TabSwitcherArgs {
  projectNames: string[];
  onCommit: (visit: TabVisit) => void;
}

interface TabSwitcherState {
  active: boolean;
  list: TabVisit[];
  index: number;
}

const CLOSED: TabSwitcherState = { active: false, list: [], index: 0 };

function onScreen(visit: TabVisit | undefined): boolean {
  if (!visit) return false;
  const id = useTerminalTitles.getState().onScreenByProject[visit.project];
  const tab = useTerminalTargets.getState().byProject[visit.project]?.find((t) => t.id === id);
  return !!tab && tab.historyKey === visit.key;
}

// Ctrl+Tab: a quick press goes back to the last tab; holding Control and
// pressing Tab again walks further back. Releasing Control opens the one shown.
export function useTabSwitcher({ projectNames, onCommit }: TabSwitcherArgs): TabSwitcherState {
  const [state, setState] = useState<TabSwitcherState>(CLOSED);

  const latest = useRef({ projectNames, onCommit });
  latest.current = { projectNames, onCommit };

  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    const cancel = () => {
      if (stateRef.current.active) setState(CLOSED);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && stateRef.current.active) {
        e.preventDefault();
        e.stopPropagation();
        cancel();
        return;
      }
      if (e.key !== "Tab" || !e.ctrlKey || e.metaKey) return;

      const dir: 1 | -1 = e.shiftKey ? -1 : 1;

      if (stateRef.current.active) {
        e.preventDefault();
        e.stopPropagation();
        setState((s) => ({ ...s, index: cycleIndex(s.list.length, s.index, dir) }));
        return;
      }

      const list = buildTabSwitchList(
        useTabHistory.getState().visits,
        new Set(latest.current.projectNames),
        useTerminalTargets.getState().byProject,
      );
      const onFirst = onScreen(list[0]);
      if (list.length === 0 || (list.length === 1 && onFirst)) return;

      e.preventDefault();
      e.stopPropagation();
      setState({ active: true, list, index: firstIndex(list.length, onFirst, dir) });
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key !== "Control") return;
      const s = stateRef.current;
      if (!s.active) return;
      const target = s.list[s.index];
      setState(CLOSED);
      if (target) latest.current.onCommit(target);
    };

    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("keyup", onKeyUp, true);
    window.addEventListener("blur", cancel);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("keyup", onKeyUp, true);
      window.removeEventListener("blur", cancel);
    };
  }, []);

  return state;
}

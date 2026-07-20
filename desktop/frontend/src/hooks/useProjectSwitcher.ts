import { useEffect, useRef, useState } from "react";
import { buildSwitchList, cycleIndex } from "../projectSwitcher";

interface ProjectSwitcherArgs {
  projectNames: string[];
  mru: string[];
  current: string | null;
  onCommit: (name: string) => void;
}

interface ProjectSwitcherState {
  active: boolean;
  list: string[];
  index: number;
}

export function useProjectSwitcher({
  projectNames,
  mru,
  current,
  onCommit,
}: ProjectSwitcherArgs): ProjectSwitcherState {
  const [state, setState] = useState<ProjectSwitcherState>({
    active: false,
    list: [],
    index: 0,
  });

  const latest = useRef({ projectNames, mru, current, onCommit });
  latest.current = { projectNames, mru, current, onCommit };

  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    const cancel = () => {
      if (stateRef.current.active) {
        setState({ active: false, list: [], index: 0 });
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || !e.ctrlKey || e.metaKey) return;

      const dir: 1 | -1 = e.shiftKey ? -1 : 1;

      if (stateRef.current.active) {
        e.preventDefault();
        e.stopPropagation();
        setState((s) => ({
          ...s,
          index: cycleIndex(s.list.length, s.index, dir),
        }));
        return;
      }

      const { projectNames, mru, current } = latest.current;
      const list = buildSwitchList(mru, projectNames, current);
      if (list.length < 2) return;

      e.preventDefault();
      e.stopPropagation();
      setState({
        active: true,
        list,
        index: cycleIndex(list.length, 0, dir),
      });
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key !== "Control") return;
      const s = stateRef.current;
      if (!s.active) return;
      const target = s.list[s.index];
      setState({ active: false, list: [], index: 0 });
      if (target) latest.current.onCommit(target);
    };

    const onOtherKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && stateRef.current.active) {
        e.preventDefault();
        e.stopPropagation();
        cancel();
      }
    };

    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("keydown", onOtherKeyDown, true);
    window.addEventListener("keyup", onKeyUp, true);
    window.addEventListener("blur", cancel);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("keydown", onOtherKeyDown, true);
      window.removeEventListener("keyup", onKeyUp, true);
      window.removeEventListener("blur", cancel);
    };
  }, []);

  return state;
}

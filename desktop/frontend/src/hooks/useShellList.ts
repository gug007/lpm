import { useEffect, useState } from "react";
import { listShells, NO_SHELLS, type ShellList } from "../shells";

// What each project's machine answered last, so a picker opens on it at once
// while the machine is asked again (a shell installed meanwhile shows up).
const answered = new Map<string, ShellList>();

/** The shells a plain terminal of `projectName` can open in, and its default. */
export function useShellList(projectName: string): ShellList {
  const [list, setList] = useState<ShellList>(() => answered.get(projectName) ?? NO_SHELLS);
  useEffect(() => {
    let alive = true;
    setList(answered.get(projectName) ?? NO_SHELLS);
    void listShells(projectName).then((next) => {
      answered.set(projectName, next);
      if (alive) setList(next);
    });
    return () => {
      alive = false;
    };
  }, [projectName]);
  return list;
}

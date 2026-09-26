import { useMemo } from "react";
import { useSideBySide } from "../store/sideBySide";
import { MAX_SIDE_BY_SIDE } from "../sideBySide";
import type { ProjectInfo } from "../types";

export interface SideBySideMenuItem {
  label: string;
  onClick: () => void;
}

// The side-by-side entries a project row's menu offers: put it next to the
// project on screen, open it together with its copies, or take it out of the
// set on screen (`columns`).
export function useSideBySideMenu(
  name: string | null,
  selected: string | null,
  columns: string[],
  projects: ProjectInfo[],
): SideBySideMenuItem[] {
  const add = useSideBySide((s) => s.add);
  const open = useSideBySide((s) => s.open);
  const remove = useSideBySide((s) => s.remove);

  return useMemo(() => {
    if (name === null) return [];
    const items: SideBySideMenuItem[] = [];
    if (columns.includes(name)) {
      items.push({ label: "Remove from side by side", onClick: () => remove(name) });
    } else if (selected !== null && selected !== name && columns.length < MAX_SIDE_BY_SIDE) {
      items.push({ label: "Open side by side", onClick: () => add(name, selected, true) });
    }
    const copies = projects.filter((p) => p.parentName === name).map((p) => p.name);
    if (copies.length > 0) {
      items.push({ label: "Open copies side by side", onClick: () => open([name, ...copies]) });
    }
    return items;
  }, [name, selected, columns, projects, add, open, remove]);
}

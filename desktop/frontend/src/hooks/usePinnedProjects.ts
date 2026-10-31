import { useMemo } from "react";
import { reorderPins, shownPins, withPin } from "../pinnedProjects";
import { useSettingsStore } from "../store/settings";
import type { ProjectInfo } from "../types";

// Writes read the pins at call time: they go through the settings file, so a
// second change made before a re-render would otherwise start from the old list.
const currentPins = () => useSettingsStore.getState().pinnedProjects;
const save = (pinnedProjects: string[] | undefined) =>
  void useSettingsStore.getState().update({ pinnedProjects });

export function togglePinned(name: string, pinned: boolean) {
  save(withPin(currentPins(), name, pinned));
}

export function reorderPinned(order: string[]) {
  save(reorderPins(currentPins(), order));
}

/** The pinned projects that are here to show, in pinned order. */
export function usePinnedProjects(byName: ReadonlyMap<string, ProjectInfo>): ProjectInfo[] {
  const pins = useSettingsStore((s) => s.pinnedProjects);
  return useMemo(
    () => shownPins(pins, new Set(byName.keys())).map((name) => byName.get(name)!),
    [pins, byName],
  );
}

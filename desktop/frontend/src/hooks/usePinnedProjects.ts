import { useMemo } from "react";
import { showUndoCloseToast } from "../components/UndoCloseToast";
import { toast } from "../notifications/toast";
import { UNDO_CLOSE_DURATION_MS } from "../pendingClose";
import { reorderPins, shownPins, withPin, withPinAt } from "../pinnedProjects";
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

const PIN_TOAST_ID = "pin-project";

// The pin key has no menu that says what it did, and the sidebar can be hidden:
// name the project, and offer it back.
export function togglePinnedWithUndo(name: string, label: string) {
  const at = currentPins()?.indexOf(name) ?? -1;
  togglePinned(name, at < 0);
  showUndoCloseToast({
    toastId: PIN_TOAST_ID,
    title: at < 0 ? `${label} pinned` : `${label} unpinned`,
    durationMs: UNDO_CLOSE_DURATION_MS,
    onUndo: () => {
      if (at < 0) togglePinned(name, false);
      else save(withPinAt(currentPins(), name, at));
      toast.dismiss(PIN_TOAST_ID);
    },
    onFinalize: () => {},
  });
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

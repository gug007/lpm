import { isZoneItemId, type ActionGroup, type ZoneGroup } from "./actionsDndLayout";
import type { ZoneFrameState } from "./ZoneFrame";

interface ZoneFrameStateInput {
  ids: string[];
  activeId: string | null;
  overGroup: ActionGroup | null;
  group: ZoneGroup;
}

interface ZoneFrameStateResult {
  state: ZoneFrameState;
  holdsButtons: boolean;
}

export function zoneFrameState({ ids, activeId, overGroup, group }: ZoneFrameStateInput): ZoneFrameStateResult {
  // A dragged zone never goes into a zone, so it never targets one.
  const buttonDrag = activeId !== null && !isZoneItemId(activeId);
  // The dragged button's own slot doesn't count: an empty zone keeps its
  // width while a button hovers in, or it would shrink out from under the
  // pointer and the preview would flicker in and out.
  const holdsButtons = ids.some((id) => id !== activeId);
  const state: ZoneFrameState = buttonDrag
    ? overGroup === group
      ? "over"
      : "target"
    : holdsButtons
      ? "filled"
      : "empty";
  return { state, holdsButtons };
}

import { isZoneGroup, isZoneItemId, zoneOfGroup, type ActionGroup, type ZoneGroup } from "./actionsDndLayout";
import type { ZoneFrameState } from "./ZoneFrame";

interface ZoneFrameStateInput {
  ids: string[];
  activeId: string | null;
  overGroup: ActionGroup | null;
  group: ZoneGroup;
  // The list the dragged button started in.
  origin?: ActionGroup | null;
}

interface ZoneFrameStateResult {
  state: ZoneFrameState;
  holdsButtons: boolean;
}

// Whether a list's grid lays out as holding buttons. The dragged button's own
// slot only counts in the list it was picked up from: an empty zone keeps its
// width while a button hovers in, or it would shrink out from under the
// pointer and the preview would flicker in and out, and a zone whose only
// button is lifted keeps its width rather than jumping to an empty zone's.
export function holdsButtonsDuringDrag(
  ids: string[],
  activeId: string | null,
  origin: ActionGroup | null | undefined,
  group: ActionGroup,
): boolean {
  return ids.some((id) => id !== activeId) || (origin === group && activeId !== null && ids.includes(activeId));
}

export function zoneFrameState({ ids, activeId, overGroup, group, origin }: ZoneFrameStateInput): ZoneFrameStateResult {
  // A dragged zone never goes into a zone, so it never targets one.
  const buttonDrag = activeId !== null && !isZoneItemId(activeId);
  const holdsButtons = holdsButtonsDuringDrag(ids, activeId, origin, group);
  const state: ZoneFrameState = buttonDrag
    ? // Any of the zone's lists: a hover on its dots can open another layer
      // without the drag's target changing.
      overGroup !== null && isZoneGroup(overGroup) && zoneOfGroup(overGroup) === zoneOfGroup(group)
      ? "over"
      : "target"
    : holdsButtons
      ? "filled"
      : "empty";
  return { state, holdsButtons };
}

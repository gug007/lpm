import { useZoneLayers } from "../../store/zoneLayers";
import { type ZoneInfo, zoneDisplayOf } from "../../types";
import { layerOfListKey, zoneOfListKey, zonePlacements } from "../../zoneLayers";
import { type ActionGroup, isZoneGroup, zoneGroup, zoneNameOfGroup } from "../actionsDndLayout";
import type { ZoneTarget } from "./ActionContextMenu";

// The zones and layers a button's menu offers to move it into, its own left out.
export function zoneTargetsFor(zones: ZoneInfo[], current: ActionGroup | null): ZoneTarget[] {
  return zonePlacements(zones)
    .map(({ zone, listKey, label }) => ({ group: zoneGroup(listKey), label, row: zoneDisplayOf(zone) }))
    .filter((target) => target.group !== current);
}

// A button moved into a layer that isn't showing would drop out of sight, so
// that layer opens.
export function showMoveTarget(projectName: string, target: ActionGroup): void {
  if (!isZoneGroup(target)) return;
  const key = zoneNameOfGroup(target);
  const layer = layerOfListKey(key);
  if (layer) useZoneLayers.getState().setOpen(projectName, zoneOfListKey(key), layer);
}

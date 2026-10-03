import type { Announcements, UniqueIdentifier } from "@dnd-kit/core";
import {
  groupOfDropId,
  isGroupDropId,
  isZoneItemId,
  zoneNameOfGroup,
  zoneNameOfItem,
} from "./actionsDndLayout";
import { zoneOfListKey } from "../zoneLayers";

function describeTarget(id: UniqueIdentifier): string {
  const s = String(id);
  if (isZoneItemId(s)) return `the ${zoneNameOfItem(s)} zone`;
  if (!isGroupDropId(s)) return s;
  const group = groupOfDropId(s);
  if (group === "header") return "the header row";
  if (group === "footer") return "the footer row";
  return `the ${zoneOfListKey(zoneNameOfGroup(group))} zone`;
}

// The dragged item as a sentence subject: "Action build" or "The tools zone".
function describeActive(id: UniqueIdentifier): string {
  const s = String(id);
  return isZoneItemId(s) ? `The ${zoneNameOfItem(s)} zone` : `Action ${s}`;
}

export const announcements: Announcements = {
  onDragStart: ({ active }) => {
    const s = String(active.id);
    return isZoneItemId(s) ? `Picked up the ${zoneNameOfItem(s)} zone.` : `Picked up action ${s}.`;
  },
  onDragOver: ({ active, over }) =>
    over
      ? `${describeActive(active.id)} is over ${describeTarget(over.id)}.`
      : `${describeActive(active.id)} is no longer over a drop zone.`,
  onDragEnd: ({ active, over }) =>
    over
      ? `${describeActive(active.id)} was dropped on ${describeTarget(over.id)}.`
      : `${describeActive(active.id)} was dropped.`,
  onDragCancel: ({ active }) =>
    `Action drag cancelled. ${describeActive(active.id)} returned to its original position.`,
};

import { toast } from "sonner";
import type { ActionsLayout, ZoneInfo } from "./types";
import { useAppStore } from "./store/app";
import { editGlobalDoc, editProjectDoc, editRepoDoc } from "./yamlQueue";
import { type ActionsSnapshot, type NewZone, type ZoneDetails, addZoneToDoc, removeZoneFromDoc, setZoneDetailsInDoc } from "./zoneConfig";
import { layoutWithoutZone } from "./components/actionsDndLayout";

type Mutate = Parameters<typeof editProjectDoc>[1];

export function editZoneSource(projectName: string, source: ZoneInfo["source"], mutate: Mutate) {
  if (source === "repo") return editRepoDoc(projectName, mutate);
  if (source === "global") return editGlobalDoc(mutate);
  return editProjectDoc(projectName, mutate);
}

export async function runZoneEdit(task: () => Promise<unknown>, failure: string): Promise<void> {
  try {
    await task();
  } catch (err) {
    toast.error(`${failure}: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    await useAppStore.getState().refreshProjects();
  }
}

export function createZone(projectName: string, snapshot: ActionsSnapshot, zone: NewZone): Promise<void> {
  return runZoneEdit(
    () => editProjectDoc(projectName, (doc) => addZoneToDoc(doc, zone, snapshot)),
    "Could not add the zone",
  );
}

export function editZone(projectName: string, zone: ZoneInfo, details: ZoneDetails): Promise<void> {
  return runZoneEdit(
    () => editZoneSource(projectName, zone.source, (doc) => setZoneDetailsInDoc(doc, zone.name, details)),
    "Could not save the zone",
  );
}

// Its buttons first move into the zone's row at its spot. The layout from
// before goes along so each one is seen leaving the zone and gets an explicit
// display for the zone's row over its zone note, even one inherited from the
// repo or global file. If that move fails the zone stays. Then the zone itself
// goes, along with any position note the project file kept for it.
export function removeZone(projectName: string, zone: ZoneInfo, layout: ActionsLayout): Promise<void> {
  return runZoneEdit(async () => {
    const moved = await useAppStore
      .getState()
      .reorderActions(projectName, layoutWithoutZone(layout, zone.name), layout);
    if (!moved) return;
    await editZoneSource(projectName, zone.source, (doc) => removeZoneFromDoc(doc, zone.name));
    if (zone.source !== "project") {
      await editProjectDoc(projectName, (doc) => removeZoneFromDoc(doc, zone.name));
    }
  }, "Could not remove the zone");
}

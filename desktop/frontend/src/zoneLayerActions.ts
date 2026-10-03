import type { ActionsLayout, ZoneInfo } from "./types";
import { useAppStore } from "./store/app";
import { useZoneLayers } from "./store/zoneLayers";
import { editProjectDoc } from "./yamlQueue";
import { editZoneSource, runZoneEdit } from "./zoneActions";
import {
  type LayerDraft,
  addLayerToDoc,
  layoutWithoutLayer,
  neighbourLayer,
  removeLayerFromDoc,
  setLayersInDoc,
} from "./zoneLayerConfig";
import { layersOf } from "./zoneLayers";

type Mutate = Parameters<typeof editZoneSource>[2];

export function addLayer(projectName: string, zone: ZoneInfo, label?: string): Promise<void> {
  let added = "";
  return runZoneEdit(async () => {
    let key = "";
    await editZoneSource(projectName, zone.source, (doc) => {
      key = addLayerToDoc(doc, zone, label);
    });
    added = key;
  }, "Could not add the layer").then(() => {
    if (added) useZoneLayers.getState().setOpen(projectName, zone.name, added);
  });
}

// Each removed layer's buttons go to the layer before it among those that
// stay, or the one after it when none stays before it.
function layoutWithoutLayers(layout: ActionsLayout, zone: ZoneInfo, removed: string[]): ActionsLayout {
  const all = layersOf(zone);
  return removed.reduce((next, layer) => {
    const layers = all.filter((candidate) => candidate.name === layer || !removed.includes(candidate.name));
    return layoutWithoutLayer(next, { name: zone.name, layers }, layer);
  }, layout);
}

// Layer fields merge file by file with the project file first, so a note it
// kept on a layer the save rewrote would override the new order and labels.
function dropProjectNotes(projectName: string, zoneName: string, layers: string[]): Promise<void> {
  return editProjectDoc(projectName, (doc) => {
    for (const layer of layers) removeLayerFromDoc(doc, zoneName, layer);
  });
}

// The buttons move first, the way removeZone moves them, so each one is seen
// leaving its layer and gets a `layer` note for its neighbour. If that move
// fails the layers stay. Then the entries go from the declaring file, along
// with any note the project file kept for the layers the edit touched.
async function dropLayers(
  projectName: string,
  zone: ZoneInfo,
  removed: string[],
  touched: string[],
  layout: ActionsLayout,
  writeSource: Mutate,
): Promise<boolean> {
  const moved = await useAppStore
    .getState()
    .reorderActions(projectName, layoutWithoutLayers(layout, zone, removed), layout);
  if (!moved) return false;
  await editZoneSource(projectName, zone.source, writeSource);
  if (zone.source !== "project") await dropProjectNotes(projectName, zone.name, touched);
  return true;
}

export function removeLayer(projectName: string, zone: ZoneInfo, layer: string, layout: ActionsLayout): Promise<void> {
  const neighbour = neighbourLayer(zone, layer);
  if (layersOf(zone).length < 2 || !neighbour) return Promise.resolve();
  let removed = false;
  return runZoneEdit(async () => {
    removed = await dropLayers(projectName, zone, [layer], [layer], layout, (doc) => removeLayerFromDoc(doc, zone.name, layer));
  }, "Could not remove the layer").then(() => {
    if (removed) useZoneLayers.getState().setOpen(projectName, zone.name, neighbour);
  });
}

export function layersUnchanged(zone: ZoneInfo, drafts: LayerDraft[]): boolean {
  const layers = layersOf(zone);
  return (
    drafts.length === layers.length &&
    drafts.every((draft, i) => draft.key === layers[i].name && draft.label.trim() === (layers[i].label ?? "").trim())
  );
}

export function saveLayers(projectName: string, zone: ZoneInfo, drafts: LayerDraft[], layout: ActionsLayout): Promise<void> {
  if (layersUnchanged(zone, drafts)) return Promise.resolve();
  const existing = layersOf(zone).map((layer) => layer.name);
  const removed = existing.filter((name) => !drafts.some((draft) => draft.key === name));
  const write: Mutate = (doc) => {
    setLayersInDoc(doc, zone.name, drafts, existing);
  };
  const save = async () => {
    if (removed.length > 0) {
      await dropLayers(projectName, zone, removed, existing, layout, write);
      return;
    }
    await editZoneSource(projectName, zone.source, write);
    if (zone.source !== "project") await dropProjectNotes(projectName, zone.name, existing);
  };
  return runZoneEdit(save, "Could not save the layers");
}

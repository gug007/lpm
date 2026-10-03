import { useEffect, useState } from "react";
import { isPeerName } from "../../peer/markers";
import { type ActionsLayout, type ZoneInfo, zoneDisplayOf } from "../../types";
import { editZone, removeZone } from "../../zoneActions";
import { useOpenLayer } from "../../store/zoneLayers";
import { type ZoneDetails, zoneDetailsOf } from "../../zoneConfig";
import { addLayer, layersUnchanged, removeLayer, saveLayers } from "../../zoneLayerActions";
import type { LayerDraft } from "../../zoneLayerConfig";
import { layersOf, layoutHasZone } from "../../zoneLayers";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { LayerNames } from "./LayerNames";
import { ZoneContextMenu } from "./ZoneContextMenu";
import { ZoneDialog } from "./ZoneDialog";

export interface ZoneMenuState {
  x: number;
  y: number;
  zone: ZoneInfo;
}

interface ZoneMenusProps {
  projectName: string;
  layout: ActionsLayout;
  menu: ZoneMenuState | null;
  onClose: () => void;
}

// A peer project's repo and global zones are out of reach: a global edit would
// land in this Mac's global.yml, and the host refuses a peer's repo save.
function isEditable(projectName: string, zone: ZoneInfo): boolean {
  return !isPeerName(projectName) || zone.source === "project";
}

// removeZone sends this project's buttons back to the zone's row. In another
// project, a button that names the vanished zone falls back to the header.
function buttonsAfterRemoval(zone: ZoneInfo): string {
  return zoneDisplayOf(zone) === "footer"
    ? "this project's buttons move back to the footer and other projects show theirs in the header"
    : "their buttons move back to the header";
}

function layerLabelOf(zone: ZoneInfo, layer: string): string | undefined {
  return layersOf(zone).find((candidate) => candidate.name === layer)?.label || undefined;
}

function draftsOfZone(zone: ZoneInfo): LayerDraft[] {
  return layersOf(zone).map((layer) => ({ key: layer.name, label: layer.label ?? "" }));
}

const sharedFileOf = (zone: ZoneInfo) => (zone.source === "global" ? "global config" : "repo's .lpm.yml");

interface SharedLayers {
  zone: ZoneInfo;
  labels: string[];
  confirm: () => void;
}

const NO_ZONE = { name: "", layers: [] };

// A zone declared in the repo or global file is shared: removing it takes it
// away from every project, so that case asks first, and so does removing one
// of its layers, here or by saving Edit zone… without them.
export function ZoneMenus({ projectName, layout, menu, onClose }: ZoneMenusProps) {
  const [sharedToRemove, setSharedToRemove] = useState<ZoneInfo | null>(null);
  const [layersToRemove, setLayersToRemove] = useState<SharedLayers | null>(null);
  const [editing, setEditing] = useState<ZoneInfo | null>(null);
  const openLayer = useOpenLayer(projectName, menu?.zone ?? NO_ZONE);
  // An external edit can remove the zone while its dialog is open; saving
  // would declare it again.
  useEffect(() => {
    if (editing && !layoutHasZone(layout, editing.name)) setEditing(null);
  }, [editing, layout]);
  const remove = (zone: ZoneInfo) => {
    if (zone.source === "project") void removeZone(projectName, zone, layout);
    else setSharedToRemove(zone);
  };
  const removeOpenLayer = (zone: ZoneInfo) => {
    if (!openLayer) return;
    if (zone.source === "project") void removeLayer(projectName, zone, openLayer, layout);
    else
      setLayersToRemove({
        zone,
        labels: [layerLabelOf(zone, openLayer) ?? openLayer],
        confirm: () => void removeLayer(projectName, zone, openLayer, layout),
      });
  };
  const save = (zone: ZoneInfo, details: ZoneDetails, layers: LayerDraft[]) => {
    setEditing(null);
    const current = zoneDetailsOf(zone);
    // Saving what is already there would still rewrite the source file, which
    // can be a tracked repo .lpm.yml.
    const detailsChanged = details.label !== current.label || details.rows !== current.rows;
    const layersChanged = !layersUnchanged(zone, layers);
    // One after the other: both rewrite the zone's file.
    const write = () =>
      void (async () => {
        if (detailsChanged) await editZone(projectName, zone, details);
        if (layersChanged) await saveLayers(projectName, zone, layers, layout);
      })();
    const removed = layersOf(zone).filter((layer) => !layers.some((draft) => draft.key === layer.name));
    if (layersChanged && removed.length > 0 && zone.source !== "project")
      setLayersToRemove({ zone, labels: removed.map((layer) => layer.label || layer.name), confirm: write });
    else write();
  };
  const several = (layersToRemove?.labels.length ?? 0) > 1;
  return (
    <>
      {menu && (
        <ZoneContextMenu
          x={menu.x}
          y={menu.y}
          editable={isEditable(projectName, menu.zone)}
          canRemoveLayer={layersOf(menu.zone).length >= 2}
          layerLabel={openLayer ? layerLabelOf(menu.zone, openLayer) : undefined}
          onNewLayer={() => void addLayer(projectName, menu.zone)}
          onEdit={() => setEditing(menu.zone)}
          onRemoveLayer={() => removeOpenLayer(menu.zone)}
          onRemove={() => remove(menu.zone)}
          onClose={onClose}
        />
      )}
      {editing && (
        <ZoneDialog
          mode="edit"
          row={zoneDisplayOf(editing)}
          placeholder={editing.name}
          initial={{ ...zoneDetailsOf(editing), layers: draftsOfZone(editing) }}
          onCancel={() => setEditing(null)}
          onSubmit={(details, layers) => save(editing, details, layers)}
        />
      )}
      <ConfirmDialog
        open={sharedToRemove !== null}
        title="Remove shared zone?"
        body={
          <>
            <span className="font-medium text-[var(--text-primary)]">{sharedToRemove?.label}</span> is declared in
            the {sharedToRemove && sharedFileOf(sharedToRemove)}. Removing it takes it away
            from every project that uses it; {sharedToRemove && buttonsAfterRemoval(sharedToRemove)}.
          </>
        }
        confirmLabel="Remove"
        variant="destructive"
        onCancel={() => setSharedToRemove(null)}
        onConfirm={() => {
          const zone = sharedToRemove;
          setSharedToRemove(null);
          if (zone) void removeZone(projectName, zone, layout);
        }}
      />
      <ConfirmDialog
        open={layersToRemove !== null}
        title={several ? "Remove shared layers?" : "Remove shared layer?"}
        body={
          <>
            <LayerNames labels={layersToRemove?.labels ?? []} /> {several ? "are layers of" : "is a layer of"}{" "}
            {layersToRemove?.zone.label}, declared in the {layersToRemove && sharedFileOf(layersToRemove.zone)}.
            {several
              ? " Removing them takes them away from every project that uses them; this project's buttons move to a layer that stays"
              : " Removing it takes it away from every project that uses it; this project's buttons move to the layer beside it"}{" "}
            and other projects show theirs in the first layer.
          </>
        }
        confirmLabel="Remove"
        variant="destructive"
        onCancel={() => setLayersToRemove(null)}
        onConfirm={() => {
          const target = layersToRemove;
          setLayersToRemove(null);
          target?.confirm();
        }}
      />
    </>
  );
}

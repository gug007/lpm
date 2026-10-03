import type { MouseEvent } from "react";
import type { ZoneLayerView } from "../actionsLayoutModel";
import type { ActionInfo, ZoneDisplay, ZoneInfo } from "../types";
import { useLayerSwipe } from "../hooks/useLayerSwipe";
import { useOpenLayer, useZoneLayers } from "../store/zoneLayers";
import { hasPager, layerOfListKey, zoneListKey } from "../zoneLayers";
import { useActionsActiveId, useActionsOverGroup, useExtractIndicator } from "./ActionsDnd";
import { ActionsGroup } from "./ActionsGroup";
import { ActionsSortableItem } from "./ActionsSortableItem";
import { ActionView } from "./ActionView";
import { ZoneDots } from "./ZoneDots";
import { ZoneEmptyHint } from "./ZoneEmptyHint";
import { ZoneExtractPlaceholder } from "./ZoneExtractPlaceholder";
import { ZoneFrame } from "./ZoneFrame";
import { ZoneLayerPager } from "./ZoneLayerPager";
import { ZoneLayerRemeasure } from "./ZoneLayerRemeasure";
import { zoneFrameState } from "./zoneFrameState";
import { ZONE_GRID_CLASS, zoneButtonSize, zoneEndSlot, zoneGridStyle } from "./zoneGeometry";
import { groupDropId, isZoneItemId, nestId, zoneGroup } from "./actionsDndLayout";

interface ZoneViewProps {
  zone: ZoneInfo;
  display: ZoneDisplay;
  layers: ZoneLayerView[];
  projectName: string;
  disabled: boolean;
  scope: string;
  onRun: (action: ActionInfo) => void;
  onActionContextMenu?: (e: MouseEvent, action: ActionInfo) => void;
  onZoneContextMenu?: (e: MouseEvent, zone: ZoneInfo) => void;
}

export function ZoneView({
  zone,
  display,
  layers,
  projectName,
  disabled,
  scope,
  onRun,
  onActionContextMenu,
  onZoneContextMenu,
}: ZoneViewProps) {
  const openKey = zoneListKey(zone.name, useOpenLayer(projectName, zone));
  const open = layers.find((layer) => layer.key === openKey) ?? layers[0] ?? { key: zone.name, layer: null, ids: [], actions: [] };
  const pager = hasPager(zone) && layers.length > 1;
  const group = zoneGroup(open.key);
  const activeId = useActionsActiveId();
  const buttonDrag = activeId !== null && !isZoneItemId(activeId);
  const extractGroup = useExtractIndicator()?.group ?? null;
  // A dragged-out menu item has no over group; it's over the zone it would join.
  const overGroup = useActionsOverGroup() ?? extractGroup;
  const { state, holdsButtons } = zoneFrameState({ ids: open.ids, activeId, overGroup, group });
  const extracting = extractGroup === group;
  const showLayer = (key: string) => {
    const layer = layerOfListKey(key);
    if (layer) useZoneLayers.getState().setOpen(projectName, zone.name, layer);
  };
  const layerAt = (dir: 1 | -1) => layers[layers.findIndex((layer) => layer.key === open.key) + dir];
  const swipe = useLayerSwipe(
    (dir) => {
      const next = layerAt(dir);
      if (next) showLayer(next.key);
    },
    (dir) => layerAt(dir) !== undefined,
  );
  const handleContextMenu = (e: MouseEvent<HTMLDivElement>) => {
    // Skip what an action's menu already took: a right-click on a split
    // button's border or its portaled dropdown bubbles here outside any button.
    // The layer dots and name are the zone's own, so they open its menu.
    const target = e.target as HTMLElement;
    const actionButton = target.closest("button") && !target.closest("[data-zone-dots]");
    if (!onZoneContextMenu || e.defaultPrevented || actionButton) return;
    e.preventDefault();
    onZoneContextMenu(e, zone);
  };
  const actionView = (action: ActionInfo) => (
    <ActionView
      action={action}
      size={zoneButtonSize(display)}
      disabled={disabled}
      onRun={onRun}
      onContextMenu={onActionContextMenu}
      scope={scope}
    />
  );
  const openList = (gridHoldsButtons: boolean) => (
    <ActionsGroup
      group={group}
      ids={open.ids}
      hint={false}
      emptyHint={false}
      placeholder={<ZoneExtractPlaceholder slot={zoneEndSlot(open.ids.length, zone.rows)} />}
      className={ZONE_GRID_CLASS}
      style={zoneGridStyle(zone.rows, gridHoldsButtons)}
    >
      {open.actions.map((action) => (
        <ActionsSortableItem key={action.name} id={action.name} className="h-full min-w-0">
          {actionView(action)}
        </ActionsSortableItem>
      ))}
    </ActionsGroup>
  );
  return (
    <ZoneFrame
      label={zone.label}
      rows={zone.rows}
      display={display}
      state={state}
      onContextMenu={handleContextMenu}
      onWheel={pager ? swipe : undefined}
    >
      {pager ? (
        <ZoneLayerPager
          layers={layers}
          openKey={open.key}
          renderPage={(layer, isOpen) =>
            isOpen ? (
              openList(layers.some((view) => view.ids.some((id) => id !== activeId)))
            ) : (
              <div className={ZONE_GRID_CLASS} style={zoneGridStyle(zone.rows, true)}>
                {layer.actions.map((action) => (
                  <div key={action.name} className="h-full min-w-0">
                    {actionView(action)}
                  </div>
                ))}
              </div>
            )
          }
        />
      ) : (
        openList(holdsButtons)
      )}
      {open.ids.length === 0 && !extracting && <ZoneEmptyHint display={display} />}
      {pager && (
        <ZoneDots zone={zone.name} layers={layers} openKey={open.key} dragging={buttonDrag} display={display} onOpen={showLayer} />
      )}
      {pager && buttonDrag && (
        <ZoneLayerRemeasure
          openKey={open.key}
          ids={[groupDropId(group), ...open.ids, ...open.ids.map(nestId)]}
        />
      )}
    </ZoneFrame>
  );
}

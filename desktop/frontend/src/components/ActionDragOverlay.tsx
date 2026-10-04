import type { ActionInfo, ZoneDisplay, ZoneInfo } from "../types";
import type { ActionsModel, ZoneLayerView } from "../actionsLayoutModel";
import { findActionByPath } from "../actionTree";
import {
  type ActionGroup,
  groupOf,
  isZoneGroup,
  isZoneItemId,
  zoneNameOfItem,
  zoneOfGroup,
} from "./actionsDndLayout";
import { openListKey } from "../store/zoneLayers";
import { ActionView } from "./ActionView";
import { ZoneEmptyHint } from "./ZoneEmptyHint";
import { ZoneFrame } from "./ZoneFrame";
import { ZONE_GRID_CLASS, zoneButtonHeight, zoneButtonSize, zoneGridStyle } from "./zoneGeometry";
import { noop } from "./project-detail/constants";

interface ActionDragOverlayProps {
  id: string;
  overGroup: ActionGroup | null;
  actions: ActionInfo[];
  model: ActionsModel;
  projectName: string;
}

interface FoundZone {
  zone: ZoneInfo;
  layers: ZoneLayerView[];
  display: ZoneDisplay;
}

function zoneNamed(model: ActionsModel, name: string): FoundZone | null {
  const rows = [
    ["header", model.headerItems],
    ["footer", model.footerItems],
  ] as const;
  for (const [display, items] of rows) {
    for (const item of items) {
      if (item.kind === "zone" && item.zone.name === name) return { zone: item.zone, layers: item.layers, display };
    }
  }
  return null;
}

// Mirrors the destination form factor while hovering, so the user sees how
// the item will look where they're aiming — not where it came from.
export function ActionDragOverlay({ id, overGroup, actions, model, projectName }: ActionDragOverlayProps) {
  if (isZoneItemId(id)) {
    const found = zoneNamed(model, zoneNameOfItem(id));
    if (!found) return null;
    const display: ZoneDisplay = overGroup === "header" || overGroup === "footer" ? overGroup : found.display;
    const openKey = openListKey(projectName, found.zone);
    const shown = (found.layers.find((layer) => layer.key === openKey) ?? found.layers[0])?.actions ?? [];
    const filled = shown.length > 0;
    return (
      <ZoneFrame rows={found.zone.rows} display={display} state={filled ? "filled" : "empty"}>
        <div className={ZONE_GRID_CLASS} style={zoneGridStyle(found.zone.rows, filled)}>
          {shown.map((action) => (
            <ActionView
              key={action.name}
              action={action}
              size={zoneButtonSize(display)}
              disabled={false}
              onRun={noop}
              scope={projectName}
            />
          ))}
        </div>
        {!filled && <ZoneEmptyHint display={display} />}
      </ZoneFrame>
    );
  }
  const action = findActionByPath(actions, id);
  if (!action) return null;
  const group = overGroup ?? groupOf(model.layout, id);
  const found = group && isZoneGroup(group) ? zoneNamed(model, zoneOfGroup(group)) : null;
  if (found) {
    return (
      <div style={{ height: zoneButtonHeight(found.zone.rows, found.display) }}>
        <ActionView action={action} size={zoneButtonSize(found.display)} disabled={false} onRun={noop} scope={projectName} />
      </div>
    );
  }
  return (
    <ActionView
      action={action}
      size={group === "footer" ? "compact" : "default"}
      disabled={false}
      onRun={noop}
      scope={projectName}
    />
  );
}

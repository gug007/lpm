import type { CSSProperties, ReactNode } from "react";
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
  // The button a drop would nest this one into, once that's armed.
  nestInto?: string | null;
  // The terminal's colours, which footer buttons take from the pane they sit on.
  footerStyle?: CSSProperties;
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

// The overlay renders outside the terminal pane, so a footer button or zone
// brings the pane's colours along.
function InBar({ display, footerStyle, children }: { display: ZoneDisplay; footerStyle?: CSSProperties; children: ReactNode }) {
  if (display !== "footer") return <>{children}</>;
  return (
    <div className="composer-terminal-surface" style={footerStyle}>
      {children}
    </div>
  );
}

// Mirrors the destination form factor while hovering, so the user sees how
// the item will look where they're aiming — not where it came from.
export function ActionDragOverlay(props: ActionDragOverlayProps) {
  const { id, overGroup, actions, model } = props;
  const display = overlayDisplay(id, overGroup, actions, model);
  return display === null ? null : (
    <InBar display={display} footerStyle={props.footerStyle}>
      <OverlayBody {...props} display={display} />
    </InBar>
  );
}

function overlayDisplay(id: string, overGroup: ActionGroup | null, actions: ActionInfo[], model: ActionsModel): ZoneDisplay | null {
  if (isZoneItemId(id)) {
    const found = zoneNamed(model, zoneNameOfItem(id));
    if (!found) return null;
    return overGroup === "header" || overGroup === "footer" ? overGroup : found.display;
  }
  if (!findActionByPath(actions, id)) return null;
  const group = overGroup ?? groupOf(model.layout, id);
  const found = group && isZoneGroup(group) ? zoneNamed(model, zoneOfGroup(group)) : null;
  return found ? found.display : group === "footer" ? "footer" : "header";
}

function OverlayBody({
  id,
  overGroup,
  nestInto = null,
  actions,
  model,
  projectName,
  display,
}: ActionDragOverlayProps & { display: ZoneDisplay }) {
  if (isZoneItemId(id)) {
    const found = zoneNamed(model, zoneNameOfItem(id));
    if (!found) return null;
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
  const button = found ? (
    <div style={{ height: zoneButtonHeight(found.zone.rows, found.display) }}>
      <ActionView action={action} size={zoneButtonSize(found.display)} disabled={false} onRun={noop} scope={projectName} />
    </div>
  ) : (
    <ActionView
      action={action}
      size={group === "footer" ? "compact" : "default"}
      disabled={false}
      onRun={noop}
      scope={projectName}
    />
  );
  if (nestInto === null) return button;
  const target = findActionByPath(actions, nestInto);
  // Above the button in the footer, where below would leave the window.
  const side = display === "footer" ? "bottom-full mb-1.5" : "top-full mt-1.5";
  return (
    <div className="relative">
      {button}
      <div
        className={`absolute left-1/2 ${side} -translate-x-1/2 whitespace-nowrap rounded-md bg-[var(--accent-blue)] px-2 py-0.5 text-[11px] font-medium text-white shadow-md`}
      >
        Add to {target?.label || nestInto}
      </div>
    </div>
  );
}

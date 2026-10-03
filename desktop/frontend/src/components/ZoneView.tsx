import type { MouseEvent } from "react";
import type { ActionInfo, ZoneDisplay, ZoneInfo } from "../types";
import { useActionsActiveId, useActionsOverGroup, useExtractIndicator } from "./ActionsDnd";
import { ActionsGroup } from "./ActionsGroup";
import { ActionsSortableItem } from "./ActionsSortableItem";
import { ActionView } from "./ActionView";
import { ZoneEmptyHint } from "./ZoneEmptyHint";
import { ZoneExtractPlaceholder } from "./ZoneExtractPlaceholder";
import { ZoneFrame } from "./ZoneFrame";
import { zoneFrameState } from "./zoneFrameState";
import { ZONE_GRID_CLASS, zoneButtonSize, zoneEndSlot, zoneGridStyle } from "./zoneGeometry";
import { zoneGroup } from "./actionsDndLayout";

interface ZoneViewProps {
  zone: ZoneInfo;
  display: ZoneDisplay;
  ids: string[];
  actions: ActionInfo[];
  disabled: boolean;
  scope: string;
  onRun: (action: ActionInfo) => void;
  onActionContextMenu?: (e: MouseEvent, action: ActionInfo) => void;
  onZoneContextMenu?: (e: MouseEvent, zone: ZoneInfo) => void;
}

export function ZoneView({
  zone,
  display,
  ids,
  actions,
  disabled,
  scope,
  onRun,
  onActionContextMenu,
  onZoneContextMenu,
}: ZoneViewProps) {
  const group = zoneGroup(zone.name);
  const activeId = useActionsActiveId();
  const extractGroup = useExtractIndicator()?.group ?? null;
  // A dragged-out menu item has no over group; it's over the zone it would join.
  const overGroup = useActionsOverGroup() ?? extractGroup;
  const { state, holdsButtons } = zoneFrameState({ ids, activeId, overGroup, group });
  const extracting = extractGroup === group;
  const handleContextMenu = (e: MouseEvent<HTMLDivElement>) => {
    // Skip what an action's menu already took: a right-click on a split
    // button's border or its portaled dropdown bubbles here outside any button.
    if (!onZoneContextMenu || e.defaultPrevented || (e.target as HTMLElement).closest("button")) return;
    e.preventDefault();
    onZoneContextMenu(e, zone);
  };
  return (
    <ZoneFrame rows={zone.rows} display={display} state={state} onContextMenu={handleContextMenu}>
      <ActionsGroup
        group={group}
        ids={ids}
        hint={false}
        emptyHint={false}
        placeholder={<ZoneExtractPlaceholder slot={zoneEndSlot(ids.length, zone.rows)} />}
        className={ZONE_GRID_CLASS}
        style={zoneGridStyle(zone.rows, holdsButtons)}
      >
        {actions.map((action) => (
          <ActionsSortableItem key={action.name} id={action.name} className="h-full min-w-0">
            <ActionView
              action={action}
              size={zoneButtonSize(display)}
              disabled={disabled}
              onRun={onRun}
              onContextMenu={onActionContextMenu}
              scope={scope}
            />
          </ActionsSortableItem>
        ))}
      </ActionsGroup>
      {ids.length === 0 && !extracting && <ZoneEmptyHint display={display} />}
    </ZoneFrame>
  );
}

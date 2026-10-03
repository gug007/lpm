import { useEffect, useState } from "react";
import { isPeerName } from "../../peer/markers";
import { type ActionsLayout, type ZoneInfo, zoneDisplayOf } from "../../types";
import { editZone, removeZone } from "../../zoneActions";
import { type ZoneDetails, zoneDetailsOf } from "../../zoneConfig";
import { ConfirmDialog } from "../ui/ConfirmDialog";
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

// A zone declared in the repo or global file is shared: removing it takes it
// away from every project, so that case asks first.
export function ZoneMenus({ projectName, layout, menu, onClose }: ZoneMenusProps) {
  const [sharedToRemove, setSharedToRemove] = useState<ZoneInfo | null>(null);
  const [editing, setEditing] = useState<ZoneInfo | null>(null);
  // An external edit can remove the zone while its dialog is open; saving
  // would declare it again.
  useEffect(() => {
    if (editing && !Object.hasOwn(layout.zones, editing.name)) setEditing(null);
  }, [editing, layout.zones]);
  const remove = (zone: ZoneInfo) => {
    if (zone.source === "project") void removeZone(projectName, zone, layout);
    else setSharedToRemove(zone);
  };
  const save = (zone: ZoneInfo, details: ZoneDetails) => {
    setEditing(null);
    const current = zoneDetailsOf(zone);
    // Saving what is already there would still rewrite the source file, which
    // can be a tracked repo .lpm.yml.
    if (details.label === current.label && details.rows === current.rows) return;
    void editZone(projectName, zone, details);
  };
  return (
    <>
      {menu && (
        <ZoneContextMenu
          x={menu.x}
          y={menu.y}
          editable={isEditable(projectName, menu.zone)}
          onEdit={() => setEditing(menu.zone)}
          onRemove={() => remove(menu.zone)}
          onClose={onClose}
        />
      )}
      {editing && (
        <ZoneDialog
          mode="edit"
          row={zoneDisplayOf(editing)}
          placeholder={editing.name}
          initial={zoneDetailsOf(editing)}
          onCancel={() => setEditing(null)}
          onSubmit={(details) => save(editing, details)}
        />
      )}
      <ConfirmDialog
        open={sharedToRemove !== null}
        title="Remove shared zone?"
        body={
          <>
            <span className="font-medium text-[var(--text-primary)]">{sharedToRemove?.label}</span> is declared in
            the {sharedToRemove?.source === "global" ? "global config" : "repo's .lpm.yml"}. Removing it takes it away
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
    </>
  );
}

import { useState } from "react";
import type { ZoneDisplay } from "../../types";
import type { RowMenuState } from "../../hooks/useRowMenu";
import { createZone } from "../../zoneActions";
import type { ActionsSnapshot, ZoneDetails } from "../../zoneConfig";
import { RowContextMenu } from "./RowContextMenu";
import { ZoneDialog } from "./ZoneDialog";

interface RowMenusProps {
  projectName: string;
  snapshot: ActionsSnapshot;
  menu: RowMenuState | null;
  onClose: () => void;
  onNewAction: (row: ZoneDisplay) => void;
}

const NEW_ZONE: ZoneDetails = { label: "", rows: 1 };

// The empty-space menu of the header and footer rows, and the dialog its
// Create zone… opens.
export function RowMenus({ projectName, snapshot, menu, onClose, onNewAction }: RowMenusProps) {
  const [createIn, setCreateIn] = useState<ZoneDisplay | null>(null);
  return (
    <>
      {menu && (
        <RowContextMenu
          x={menu.x}
          y={menu.y}
          row={menu.row}
          onNewAction={() => onNewAction(menu.row)}
          onCreateZone={() => setCreateIn(menu.row)}
          onClose={onClose}
        />
      )}
      {createIn && (
        <ZoneDialog
          mode="create"
          row={createIn}
          placeholder="Optional"
          initial={NEW_ZONE}
          onCancel={() => setCreateIn(null)}
          onSubmit={(details) => {
            setCreateIn(null);
            void createZone(projectName, snapshot, { ...details, display: createIn });
          }}
        />
      )}
    </>
  );
}

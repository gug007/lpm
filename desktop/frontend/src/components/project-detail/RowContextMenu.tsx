import type { ZoneDisplay } from "../../types";
import { PanelBottomIcon, PanelTopIcon, PlusIcon } from "../icons";
import { ContextMenuItem } from "../ui/ContextMenuItem";
import { ContextMenuShell } from "../ui/ContextMenuShell";

interface RowContextMenuProps {
  x: number;
  y: number;
  row: ZoneDisplay;
  onNewAction: () => void;
  onCreateZone: () => void;
  onClose: () => void;
}

export function RowContextMenu({ x, y, row, onNewAction, onCreateZone, onClose }: RowContextMenuProps) {
  const close = (fn: () => void) => () => {
    fn();
    onClose();
  };
  return (
    <ContextMenuShell x={x} y={y} onClose={onClose}>
      <ContextMenuItem label="New action" icon={<PlusIcon />} onClick={close(onNewAction)} />
      <ContextMenuItem
        label="Create zone…"
        icon={row === "footer" ? <PanelBottomIcon /> : <PanelTopIcon />}
        onClick={close(onCreateZone)}
      />
    </ContextMenuShell>
  );
}

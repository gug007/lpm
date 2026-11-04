import { Check, FolderInput } from "lucide-react";
import { ContextMenuItem } from "../ui/ContextMenuItem";
import { ContextMenuSeparator } from "../ui/ContextMenuSeparator";
import { ContextMenuSubmenu } from "../ui/ContextMenuSubmenu";
import { sameSpot, type OtherSpot } from "./commandsModel";

interface CommandOtherMoveItemsProps {
  // The folders of the skill's own list.
  folders: string[];
  current: OtherSpot;
  onMove: (spot: OtherSpot) => void;
  onNewFolder: () => void;
}

// Where a skill not made in lpm can go from its row's menu. Its file stays as it
// is, so none of this asks anything of the skill.
export function CommandOtherMoveItems({ folders, current, onMove, onNewFolder }: CommandOtherMoveItemsProps) {
  const spots: { label: string; spot: OtherSpot }[] = [
    ...folders.map((folder) => ({ label: folder, spot: { folder, root: false } })),
    { label: "No folder", spot: { folder: null, root: true } },
    { label: "Other skills", spot: { folder: null, root: false } },
  ];
  return (
    <ContextMenuSubmenu label="Move to folder" icon={<FolderInput size={12} />}>
      {spots.map(({ label, spot }) => {
        const here = sameSpot(spot, current);
        return (
          <ContextMenuItem
            key={label}
            label={label}
            disabled={here}
            trailing={here ? <Check size={11} /> : undefined}
            onClick={() => onMove(spot)}
          />
        );
      })}
      <ContextMenuSeparator />
      <ContextMenuItem label="New folder" onClick={onNewFolder} />
    </ContextMenuSubmenu>
  );
}

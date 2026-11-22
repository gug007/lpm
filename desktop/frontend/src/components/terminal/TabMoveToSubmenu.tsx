import { FolderInput } from "lucide-react";
import { useAppStore } from "../../store/app";
import { moveDestinations, moveTab } from "../../tabMove";
import { ContextMenuItem } from "../ui/ContextMenuItem";
import { ContextMenuSubmenu } from "../ui/ContextMenuSubmenu";

interface TabMoveToSubmenuProps {
  projectName: string;
  terminalId: string;
  onClose: () => void;
}

/** "Move to ▸" the other projects on the tab's computer. Absent where there is
 *  nowhere to move it. */
export function TabMoveToSubmenu({ projectName, terminalId, onClose }: TabMoveToSubmenuProps) {
  const projects = useAppStore((s) => s.projects);
  const destinations = moveDestinations(projectName, projects);
  if (destinations.length === 0) return null;
  return (
    <ContextMenuSubmenu label="Move to" icon={<FolderInput size={12} />}>
      <div className="max-h-[60vh] min-w-48 overflow-y-auto">
        {destinations.map((dest) => (
          <ContextMenuItem
            key={dest.name}
            label={dest.label}
            onClick={() => {
              moveTab(projectName, terminalId, dest);
              onClose();
            }}
          />
        ))}
      </div>
    </ContextMenuSubmenu>
  );
}

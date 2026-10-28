import { Archive } from "lucide-react";
import { archiveAgents } from "../agentArchive";
import type { SidebarAgentRow } from "../sidebarAgents";
import { canArchive } from "../sidebarSeenAgents";
import { ContextMenuItem } from "./ui/ContextMenuItem";
import { ContextMenuSeparator } from "./ui/ContextMenuSeparator";

interface ProjectArchiveMenuItemsProps {
  projectName: string;
  label: string;
  agents: SidebarAgentRow[];
  onClose: () => void;
}

/** A project menu's way to put its finished agents away at once: the ones
 *  already seen, or every one whose turn has ended. */
export function ProjectArchiveMenuItems({ projectName, label, agents, onClose }: ProjectArchiveMenuItemsProps) {
  const finished = agents.filter(canArchive);
  const seen = finished.filter((r) => r.seenAt !== undefined);
  if (finished.length === 0) return null;
  const archive = (rows: SidebarAgentRow[]) => () => {
    archiveAgents(projectName, rows, label);
    onClose();
  };
  return (
    <>
      {seen.length > 0 && (
        <ContextMenuItem
          label={`Archive seen agents (${seen.length})`}
          icon={<Archive size={12} />}
          onClick={archive(seen)}
        />
      )}
      {finished.length > seen.length && (
        <ContextMenuItem
          label={`Archive all finished agents (${finished.length})`}
          icon={<Archive size={12} />}
          onClick={archive(finished)}
        />
      )}
      <ContextMenuSeparator />
    </>
  );
}

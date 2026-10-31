import { sidebarProjectAlert, type SidebarAgentRow } from "../sidebarAgents";
import type { ProjectInfo } from "../types";
import { chordLabel } from "../keys";
import { PROJECT_JUMP_SHORTCUTS } from "../projectJumpShortcuts";
import { SidebarPinnedRow } from "./SidebarPinnedRow";
import { SortableItem, SortableList } from "./ui/SortableList";

interface SidebarPinnedProps {
  projects: ProjectInfo[];
  byName: ReadonlyMap<string, ProjectInfo>;
  agentsByProject: ReadonlyMap<string, SidebarAgentRow[]>;
  selected: string | null;
  menuFor: string | null;
  width: number;
  onSelect: (name: string) => void;
  onOpenMenu: (name: string, x: number, y: number) => void;
  onReorder: (order: string[]) => void;
}

/** The projects pinned above the list, in an order of their own that ⌘1–⌘9
 *  follow. They stay in their places below as well: a pin is a way back, not a
 *  move, so folders and decks keep every project they hold. */
export function SidebarPinned({
  projects,
  byName,
  agentsByProject,
  selected,
  menuFor,
  width,
  onSelect,
  onOpenMenu,
  onReorder,
}: SidebarPinnedProps) {
  const ids = projects.map((p) => p.name);
  return (
    <section aria-label="Pinned projects" className="shrink-0 pb-2" style={{ minWidth: width }}>
      <h2 className="px-4 pb-1.5 text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">
        Pinned
      </h2>
      <div className="max-h-[35vh] overflow-y-auto px-2">
        <SortableList ids={ids} onReorder={onReorder}>
          {projects.map((project, i) => (
            <SortableItem key={project.name} id={project.name}>
              <SidebarPinnedRow
                project={project}
                parent={project.parentName ? byName.get(project.parentName) : undefined}
                shortcut={PROJECT_JUMP_SHORTCUTS[i] && chordLabel(PROJECT_JUMP_SHORTCUTS[i])}
                alert={sidebarProjectAlert(agentsByProject.get(project.name) ?? [])}
                selected={selected === project.name}
                menuOpen={menuFor === project.name}
                onSelect={() => onSelect(project.name)}
                onOpenMenu={(x, y) => onOpenMenu(project.name, x, y)}
              />
            </SortableItem>
          ))}
        </SortableList>
      </div>
    </section>
  );
}

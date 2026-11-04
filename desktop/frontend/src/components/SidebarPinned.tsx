import { sidebarProjectAlert, type SidebarAgentRow } from "../sidebarAgents";
import { useCollapsedPinnedAgents } from "../sidebarCollapsed";
import { isPeerName } from "../peer/markers";
import type { ProjectInfo } from "../types";
import type { ProjectWindow } from "../windowFocus";
import { chordLabel } from "../keys";
import { PROJECT_JUMP_SHORTCUTS } from "../projectJumpShortcuts";
import { projectDisplayName } from "./ProjectNameDisplay";
import { SidebarAgentRows, type SidebarAgentRowsProps } from "./SidebarAgentRows";
import { SidebarPinnedRow } from "./SidebarPinnedRow";
import { SortableItem, SortableList } from "./ui/SortableList";

interface SidebarPinnedProps {
  projects: ProjectInfo[];
  byName: ReadonlyMap<string, ProjectInfo>;
  agentsByProject: ReadonlyMap<string, SidebarAgentRow[]>;
  focusedTerminals: Readonly<Record<string, string | null>>;
  selected: string | null;
  menuFor: string | null;
  width: number;
  windowOf: (name: string) => ProjectWindow;
  onSelect: (name: string) => void;
  onOpenMenu: (name: string, x: number, y: number) => void;
  onReorder: (order: string[]) => void;
  onOpenAgent: SidebarAgentRowsProps["onOpenAgent"];
  onAgentAction: SidebarAgentRowsProps["onAgentAction"];
}

/** The projects pinned above the list, in an order of their own that ⌘1–⌘9
 *  follow. They stay in their places below as well: a pin is a way back, not a
 *  move, so folders and decks keep every project they hold. */
export function SidebarPinned({
  projects,
  byName,
  agentsByProject,
  focusedTerminals,
  selected,
  menuFor,
  width,
  windowOf,
  onSelect,
  onOpenMenu,
  onReorder,
  onOpenAgent,
  onAgentAction,
}: SidebarPinnedProps) {
  const collapsed = useCollapsedPinnedAgents((s) => s.collapsed);
  const toggle = useCollapsedPinnedAgents((s) => s.toggle);
  const ids = projects.map((p) => p.name);
  return (
    <section aria-label="Pinned projects" className="shrink-0 pb-2" style={{ minWidth: width }}>
      <h2 className="pb-1 pl-[18px] pr-4 pt-3.5 text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">
        Pinned
      </h2>
      <div className="max-h-[35vh] overflow-y-auto px-2">
        <SortableList ids={ids} onReorder={onReorder}>
          {projects.map((project, i) => {
            const parent = project.parentName ? byName.get(project.parentName) : undefined;
            const agents = agentsByProject.get(project.name) ?? [];
            const canExpand = agents.length > 0;
            const expanded = canExpand && !collapsed.has(project.name);
            const isSelected = selected === project.name;
            return (
              <SortableItem key={project.name} id={project.name}>
                <SidebarPinnedRow
                  project={project}
                  parent={parent}
                  shortcut={PROJECT_JUMP_SHORTCUTS[i] && chordLabel(PROJECT_JUMP_SHORTCUTS[i])}
                  alert={sidebarProjectAlert(agents)}
                  opensIn={windowOf(project.name)}
                  canExpand={canExpand}
                  expanded={expanded}
                  selected={isSelected}
                  menuOpen={menuFor === project.name}
                  onSelect={() => onSelect(project.name)}
                  onToggleAgents={() => toggle(project.name)}
                  onOpenMenu={(x, y) => onOpenMenu(project.name, x, y)}
                />
                {expanded && (
                  <SidebarAgentRows
                    projectName={project.name}
                    label={isPeerName(project.name) ? projectDisplayName(project, parent) : undefined}
                    agents={agents}
                    activeTerminalId={isSelected ? focusedTerminals[project.name] ?? null : null}
                    onOpenAgent={onOpenAgent}
                    onAgentAction={onAgentAction}
                  />
                )}
              </SortableItem>
            );
          })}
        </SortableList>
      </div>
    </section>
  );
}

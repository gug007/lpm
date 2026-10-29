import { Fragment, memo, useRef, useState } from "react";
import { archiveAgents, markAgentSeen, markAgentUnread } from "../agentArchive";
import type { SidebarAgentRow } from "../sidebarAgents";
import { useExpandedSeenAgents } from "../sidebarCollapsed";
import { isPeerName } from "../peer/markers";
import { canArchive, foldSeenRows } from "../sidebarSeenAgents";
import { DEFAULT_SEEN_SHOWN, useSettingsStore } from "../store/settings";
import { SidebarAgentAsk } from "./SidebarAgentAsk";
import { SidebarAgentFold } from "./SidebarAgentFold";
import { SidebarAgentLine } from "./SidebarAgentLine";
import { SidebarAgentMenu, type AgentTabAction } from "./SidebarAgentMenu";

export interface SidebarAgentRowsProps {
  projectName: string;
  /** The project as the user reads it, where that is not the name the rest of
   *  the app routes by — a paired host's projects carry a peer marker. */
  label?: string;
  agents: SidebarAgentRow[];
  /** Set when the project row above sits inside an expanded folder, so its
   *  tasks take the same disclosure step and stay under its name. */
  indented?: boolean;
  /** Set under a footer nav row, whose icon is wider than a project's dot, so
   *  the names still start where the label above them does. */
  underNav?: boolean;
  /** The terminal on screen right now, or null when this project isn't the one
   *  being looked at. The row that owns it is marked as where the user is. */
  activeTerminalId?: string | null;
  onOpenAgent: (projectName: string, agent: SidebarAgentRow) => void;
  /** A right-click menu action on the row's tab, at the point it was asked. */
  onAgentAction?: (
    projectName: string,
    agent: SidebarAgentRow,
    action: AgentTabAction,
    at: { x: number; y: number },
  ) => void;
}

/** What a project has agents on, under its row: one line per task, in the order
 *  their tabs sit in. Each line opens its terminal, and the one already on
 *  screen is marked. Finishes already seen stay until archived; past the number
 *  Settings shows, the older of them fold into one line. */
export const SidebarAgentRows = memo(function SidebarAgentRows({
  projectName,
  label,
  agents,
  indented,
  underNav,
  activeTerminalId,
  onOpenAgent,
  onAgentAction,
}: SidebarAgentRowsProps) {
  const lead = indented ? "pl-[25px]" : underNav ? "pl-3" : "pl-2.5";
  const [menu, setMenu] = useState<{ agent: SidebarAgentRow; x: number; y: number } | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const limit = useSettingsStore((s) => s.seenAgentsShown ?? DEFAULT_SEEN_SHOWN);
  const keepsSeen = useSettingsStore((s) => s.keepFinishedAgents ?? false);
  const expanded = useExpandedSeenAgents((s) => s.collapsed.has(projectName));
  const toggleExpanded = useExpandedSeenAgents((s) => s.toggle);
  const onScreen = activeTerminalId ?? null;
  const { shown, folded } = foldSeenRows(agents, limit, onScreen);
  const visible = expanded ? agents : shown;
  // A paired machine's terminals take input over its own link, not this one.
  const canAnswer = !isPeerName(projectName);

  const open = (agent: SidebarAgentRow) => {
    if (agent.seenAt !== undefined) markAgentSeen(projectName, agent);
    onOpenAgent(projectName, agent);
  };

  const archive = (agent: SidebarAgentRow, viaKeyboard: boolean) => {
    const lines = [...(listRef.current?.querySelectorAll<HTMLElement>("[data-agent-row]") ?? [])];
    const at = lines.findIndex((el) => el.dataset.agentRow === agent.key);
    const next = viaKeyboard ? lines[at + 1] ?? lines[at - 1] : undefined;
    archiveAgents(projectName, [agent]);
    next?.focus();
  };

  return (
    <div ref={listRef} className="mb-0.5 flex flex-col">
      {visible.map((agent) => (
        <Fragment key={agent.key}>
          <SidebarAgentLine
            agent={agent}
            where={label ?? projectName}
            lead={lead}
            active={agent.terminalId !== null && agent.terminalId === onScreen}
            onOpen={() => open(agent)}
            onMenu={(at) => setMenu({ agent, ...at })}
            onArchive={canArchive(agent) ? (viaKeyboard) => archive(agent, viaKeyboard) : undefined}
          />
          {canAnswer && agent.state === "needs-you" && agent.terminalId && agent.terminalId !== onScreen && (
            <SidebarAgentAsk terminalId={agent.terminalId} lead={lead} onOpen={() => open(agent)} />
          )}
        </Fragment>
      ))}
      {folded.length > 0 && (
        <SidebarAgentFold
          count={folded.length}
          expanded={expanded}
          lead={lead}
          onToggle={() => toggleExpanded(projectName)}
          onArchive={() => archiveAgents(projectName, folded, label ?? projectName)}
        />
      )}
      {menu && (
        <SidebarAgentMenu
          x={menu.x}
          y={menu.y}
          projectName={projectName}
          agent={menu.agent}
          onOpen={() => open(menu.agent)}
          onAction={
            onAgentAction &&
            ((action) => onAgentAction(projectName, menu.agent, action, { x: menu.x, y: menu.y }))
          }
          onArchive={canArchive(menu.agent) ? () => archiveAgents(projectName, [menu.agent]) : undefined}
          onMarkSeen={
            keepsSeen && canArchive(menu.agent) && menu.agent.seenAt === undefined
              ? () => markAgentSeen(projectName, menu.agent)
              : undefined
          }
          onMarkUnread={
            menu.agent.seenAt !== undefined ? () => markAgentUnread(projectName, menu.agent) : undefined
          }
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  );
});

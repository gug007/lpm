import { useMemo, useState } from "react";
import { BrowserOpenURL } from "../../bridge/runtime";
import { AGENT_STATE_LABEL, AGENT_STATE_TONE, computeProjectStatus } from "../agentStatus";
import { useJobsAmbient } from "../hooks/useJobsAmbient";
import { hiddenKeys, useArchivingAgents } from "../agentArchive";
import { sidebarProjectAlert } from "../sidebarAgents";
import { sidebarAgentRows } from "../sidebarSeenAgents";
import { useCollapsedAgents } from "../sidebarCollapsed";
import {
  DEFAULT_SIDEBAR_NAV,
  isDefaultSidebarNav,
  menuNavItems,
  TUTORIAL_PLAYLIST_URL,
  withSidebarNav,
  type NavItemId,
} from "../sidebarNav";
import { useGlobalAgentStatus } from "../store/globalAgentStatus";
import { useSettingsStore } from "../store/settings";
import { useWeeklyRecapStore } from "../store/weeklyRecap";
import { useTerminalTitles } from "../store/terminalTitles";
import { GLOBAL_TERMINALS_KEY } from "../terminals";
import {
  HistoryIcon,
  MessageIcon,
  RecapIcon,
  SettingsIcon,
  SmartphoneIcon,
  StatsIcon,
  TerminalIcon,
  YoutubeIcon,
  ZapIcon,
} from "./icons";
import { SidebarAgentSummary } from "./SidebarAgentSummary";
import { SidebarFooterMore } from "./SidebarFooterMore";
import { SidebarNavRowMenu } from "./SidebarNavRowMenu";
import { SidebarNavRow, type SidebarNavEntry } from "./SidebarNavRow";
import { CountBadge } from "./ui/CountBadge";
import { Tooltip } from "./ui/Tooltip";

interface SidebarFooterNavProps {
  showTerminals: boolean;
  onTerminals: () => void;
  // Puts one of the global Terminals' tabs on screen, from its agent row.
  onOpenTerminalTab: (terminalId: string) => void;
  showScheduled: boolean;
  onScheduled: () => void;
  showUsage: boolean;
  onUsage: () => void;
  showStats: boolean;
  onStats: () => void;
  showMobile: boolean;
  onMobile: () => void;
  showSettings: boolean;
  onSettings: () => void;
  onFeedback: () => void;
}

interface RowMenu {
  entry: SidebarNavEntry;
  x: number;
  y: number;
}

/** The sidebar's footer navigation. Every row lives either here or in the More
 *  menu, and the user moves it across; only Terminals starts out in the open. */
export function SidebarFooterNav({
  showTerminals,
  onTerminals,
  onOpenTerminalTab,
  showScheduled,
  onScheduled,
  showUsage,
  onUsage,
  showStats,
  onStats,
  showMobile,
  onMobile,
  showSettings,
  onSettings,
  onFeedback,
}: SidebarFooterNavProps) {
  const inSidebar = useSettingsStore((s) => s.sidebarNavInSidebar ?? DEFAULT_SIDEBAR_NAV);
  const update = useSettingsStore((s) => s.update);
  const recapOpen = useWeeklyRecapStore((s) => s.open);
  const showRecap = useWeeklyRecapStore((s) => s.show);
  const { running, unread, waiting } = useJobsAmbient();
  const [rowMenu, setRowMenu] = useState<RowMenu | null>(null);

  // Agents in the global Terminals report under the reserved key, which no
  // project row speaks for — so the Terminals row does, the way a project row
  // speaks for its own: its label wears their state and lists them underneath.
  const terminalEntries = useGlobalAgentStatus((s) => s.entries);
  const terminalSeen = useGlobalAgentStatus((s) => s.seen);
  const archiving = useArchivingAgents((s) => s.hidden);
  const terminalTitles = useTerminalTitles((s) => s.byProject[GLOBAL_TERMINALS_KEY]);
  const focusedTerminal = useTerminalTitles(
    (s) => s.focusedByProject[GLOBAL_TERMINALS_KEY] ?? null,
  );
  const collapsedAgents = useCollapsedAgents((s) => s.collapsed);
  const toggleAgents = useCollapsedAgents((s) => s.toggle);
  const terminalStatus = useMemo(() => computeProjectStatus(terminalEntries), [terminalEntries]);
  const terminalAgents = useMemo(
    () =>
      sidebarAgentRows(
        { statusEntries: terminalEntries, seenEntries: terminalSeen },
        Date.now(),
        terminalTitles,
        hiddenKeys(archiving, GLOBAL_TERMINALS_KEY),
      ),
    [terminalEntries, terminalSeen, terminalTitles, archiving],
  );
  const terminalAlert = sidebarProjectAlert(terminalAgents);

  const isDefault = isDefaultSidebarNav(inSidebar);
  // Read the layout at click time, not at render time: a write goes through the
  // settings file, so a second move made before this component re-renders would
  // otherwise be computed from — and clobber back to — the pre-move list.
  const move = (id: NavItemId, toSidebar: boolean) => {
    const current =
      useSettingsStore.getState().sidebarNavInSidebar ?? DEFAULT_SIDEBAR_NAV;
    void update({ sidebarNavInSidebar: withSidebarNav(current, id, toSidebar) });
  };
  const reset = () => void update({ sidebarNavInSidebar: undefined });

  const automationsTrailing =
    waiting > 0 ? (
      <span className={`text-[10px] font-medium ${AGENT_STATE_TONE["needs-you"]}`}>
        {AGENT_STATE_LABEL["needs-you"]}
      </span>
    ) : running > 0 ? (
      <span className="flex items-center gap-1.5 text-[10px] font-medium text-[var(--accent-cyan)]">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--accent-cyan)]" />
        Running
      </span>
    ) : (
      <CountBadge count={unread} label="unread automations" />
    );

  // Rebuilt each render: every field but the label and icon is live state, so
  // there is nothing here a memo could hold on to.
  const entries: Record<NavItemId, SidebarNavEntry> = {
    terminals: {
      id: "terminals",
      label: "Terminals",
      icon: <TerminalIcon />,
      active: showTerminals,
      onSelect: onTerminals,
      description:
        "Quick shells for scripts, system commands, and anything not tied to a project.",
      status: terminalStatus,
      trailing: terminalAlert ? <SidebarAgentSummary agent={terminalAlert} /> : undefined,
      agents: {
        projectName: GLOBAL_TERMINALS_KEY,
        rows: terminalAgents,
        expanded: !collapsedAgents.has(GLOBAL_TERMINALS_KEY),
        onToggle: () => toggleAgents(GLOBAL_TERMINALS_KEY),
        // Only while the Terminals are on screen is the focused tab the one
        // being looked at; otherwise it is just where they were left.
        activeTerminalId: showTerminals ? focusedTerminal : null,
        // A status whose tab the backend never named can still only take you
        // to the Terminals.
        onOpen: (agent) =>
          agent.terminalId ? onOpenTerminalTab(agent.terminalId) : onTerminals(),
      },
    },
    automations: {
      id: "automations",
      label: "Automations",
      icon: <HistoryIcon />,
      active: showScheduled,
      onSelect: onScheduled,
      trailing: automationsTrailing,
    },
    usage: {
      id: "usage",
      label: "Usage",
      icon: <ZapIcon />,
      active: showUsage,
      onSelect: onUsage,
    },
    stats: {
      id: "stats",
      label: "Stats",
      icon: <StatsIcon />,
      active: showStats,
      onSelect: onStats,
    },
    recap: {
      id: "recap",
      label: "Weekly recap",
      icon: <RecapIcon />,
      active: recapOpen,
      onSelect: () => showRecap("last"),
      description: "Your agents' week as a card to share: hours, prompts, lines and streak.",
    },
    mobile: {
      id: "mobile",
      label: "Mobile app",
      icon: <SmartphoneIcon />,
      active: showMobile,
      onSelect: onMobile,
    },
    settings: {
      id: "settings",
      label: "Settings",
      icon: <SettingsIcon />,
      active: showSettings,
      onSelect: onSettings,
    },
    tutorial: {
      id: "tutorial",
      label: "Tutorial (YouTube)",
      icon: <YoutubeIcon />,
      active: false,
      onSelect: () => BrowserOpenURL(TUTORIAL_PLAYLIST_URL),
      description: "Short video lessons on lpm, opened in your browser.",
    },
  };

  const menuIds = menuNavItems(inSidebar);
  // The button only speaks for what it is still hiding — a row moved out to the
  // sidebar carries its own badge and must not be counted twice.
  const automationsInMenu = menuIds.includes("automations");
  const hints = automationsInMenu
    ? [
        waiting > 0
          ? `${waiting} automation${waiting === 1 ? "" : "s"} waiting for your answer`
          : "",
        running > 0 ? "an automation is running" : "",
        unread > 0 ? `${unread} automation${unread === 1 ? "" : "s"} with new messages` : "",
      ].filter(Boolean)
    : [];

  return (
    <div className="flex flex-col p-2">
      {inSidebar.map((id) => (
        <SidebarNavRow
          key={id}
          entry={entries[id]}
          menuOpen={rowMenu?.entry.id === id}
          onOpenMenu={(anchor) => setRowMenu({ entry: entries[id], ...anchor })}
        />
      ))}
      <div className="flex items-center gap-1">
        {menuIds.length > 0 && (
          <SidebarFooterMore
            entries={menuIds.map((id) => entries[id])}
            badge={
              automationsInMenu ? (
                waiting > 0 ? (
                  <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent-amber)]" />
                ) : running > 0 ? (
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--accent-cyan)]" />
                ) : (
                  <CountBadge count={unread} label="unread automations" />
                )
              ) : null
            }
            hints={hints}
            isDefault={isDefault}
            onMove={(id) => move(id, true)}
            onReset={reset}
          />
        )}
        <Tooltip content="Support & Feedback" triggerClassName="ml-auto inline-flex shrink-0">
          <button
            type="button"
            onClick={onFeedback}
            className="flex h-9 w-9 items-center justify-center rounded-md text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
            aria-label="Support & Feedback"
          >
            <MessageIcon />
          </button>
        </Tooltip>
      </div>
      {rowMenu && (
        <SidebarNavRowMenu
          x={rowMenu.x}
          y={rowMenu.y}
          label={rowMenu.entry.label}
          inSidebar
          isDefault={isDefault}
          onMove={() => move(rowMenu.entry.id, false)}
          onReset={reset}
          onClose={() => setRowMenu(null)}
        />
      )}
    </div>
  );
}

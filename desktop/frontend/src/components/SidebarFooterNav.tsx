import { useState } from "react";
import { useAgentOverviewShortcut } from "../hooks/useAgentOverviewShortcut";
import { useJobsAmbient } from "../hooks/useJobsAmbient";
import {
  DEFAULT_SIDEBAR_NAV,
  isDefaultSidebarNav,
  menuNavItems,
  withSidebarNav,
  type NavItemId,
} from "../sidebarNav";
import { useSettingsStore } from "../store/settings";
import {
  HistoryIcon,
  LayersIcon,
  MessageIcon,
  SettingsIcon,
  SmartphoneIcon,
  StatsIcon,
  TerminalIcon,
  ZapIcon,
} from "./icons";
import { SidebarFooterMore } from "./SidebarFooterMore";
import { SidebarNavRowMenu } from "./SidebarNavRowMenu";
import { SidebarNavRow, type SidebarNavEntry } from "./SidebarNavRow";
import { SidebarNavSignals } from "./SidebarNavSignals";
import { CountBadge } from "./ui/CountBadge";

interface SidebarFooterNavProps {
  showTerminals: boolean;
  onTerminals: () => void;
  showActivity: boolean;
  onActivity: () => void;
  needsYou: number;
  hasError: boolean;
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
  showActivity,
  onActivity,
  needsYou,
  hasError,
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
  const { running, unread } = useJobsAmbient();
  const [rowMenu, setRowMenu] = useState<RowMenu | null>(null);
  // Bound here rather than on the Activity row so the shortcut keeps working
  // wherever that row currently lives, menu closed or open.
  const shortcut = useAgentOverviewShortcut(onActivity);

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
    running > 0 ? (
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
    },
    activity: {
      id: "activity",
      label: "Activity",
      icon: <LayersIcon />,
      active: showActivity,
      onSelect: onActivity,
      description:
        "Every agent and automation across your projects, ordered by what is waiting on you.",
      trailing: (
        <>
          <SidebarNavSignals needsYou={needsYou} hasError={hasError} />
          {shortcut && <kbd className="shrink-0 text-[10px] opacity-50">{shortcut}</kbd>}
        </>
      ),
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
    feedback: {
      id: "feedback",
      label: "Support & Feedback",
      icon: <MessageIcon />,
      active: false,
      onSelect: onFeedback,
    },
  };

  const menuIds = menuNavItems(inSidebar);
  // The button only speaks for what it is still hiding — a row moved out to the
  // sidebar carries its own badge and must not be counted twice.
  const inMenu = (id: NavItemId) => menuIds.includes(id);
  const hints = [
    inMenu("activity") && needsYou > 0
      ? `${needsYou} agent${needsYou === 1 ? "" : "s"} waiting on you`
      : "",
    inMenu("activity") && hasError ? "an agent hit an error" : "",
    inMenu("automations") && running > 0 ? "a scheduled job is running" : "",
    inMenu("automations") && unread > 0
      ? `${unread} automation${unread === 1 ? "" : "s"} with new messages`
      : "",
  ].filter(Boolean);

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
      {menuIds.length > 0 && (
        <SidebarFooterMore
          entries={menuIds.map((id) => entries[id])}
          signals={
            inMenu("activity") ? (
              <SidebarNavSignals needsYou={needsYou} hasError={hasError} />
            ) : null
          }
          badge={
            inMenu("automations") ? (
              running > 0 ? (
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

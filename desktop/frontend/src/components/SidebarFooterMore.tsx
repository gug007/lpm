import { useEffect, useState } from "react";
import { EventsOn } from "../../bridge/runtime";
import { ListAllJobs } from "../../bridge/commands";
import { useAgentOverviewShortcut } from "../hooks/useAgentOverviewShortcut";
import { useEventListener } from "../hooks/useEventListener";
import { useOutsideClick } from "../hooks/useOutsideClick";
import {
  HistoryIcon,
  LayersIcon,
  MessageIcon,
  MoreHorizontalIcon,
  SettingsIcon,
  SmartphoneIcon,
  StatsIcon,
  ZapIcon,
} from "./icons";
import { MENU_PANEL_CLASS } from "./ui/ContextMenuShell";
import { CountBadge } from "./ui/CountBadge";

interface SidebarFooterMoreProps {
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

// Ambient scheduled-job state for the footer: how many jobs are running, and
// how many have results the user hasn't read. A headless run is otherwise
// invisible outside a transient toast.
function useJobsAmbient(): { running: number; unread: number } {
  const [running, setRunning] = useState(0);
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    let alive = true;
    const refresh = () => {
      ListAllJobs()
        .then((rows) => {
          if (!alive) return;
          const list = Array.isArray(rows)
            ? (rows as { running?: boolean; unread?: number }[])
            : [];
          setRunning(list.filter((r) => r.running === true).length);
          setUnread(list.filter((r) => (r.unread ?? 0) > 0).length);
        })
        .catch(() => {});
    };
    refresh();
    const cancelStatus = EventsOn("job-status", refresh);
    const cancelSeen = EventsOn("job-seen", refresh);
    return () => {
      alive = false;
      if (typeof cancelStatus === "function") cancelStatus();
      if (typeof cancelSeen === "function") cancelSeen();
    };
  }, []);
  return { running, unread };
}

function ActivitySignals({ needsYou, hasError }: { needsYou: number; hasError: boolean }) {
  if (needsYou <= 0 && !hasError) return null;
  return (
    <span className="flex items-center gap-1.5">
      {needsYou > 0 && (
        <span className="flex items-center gap-1 text-[10px] font-medium tabular-nums text-[var(--accent-amber)]">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent-amber)]" />
          {needsYou}
        </span>
      )}
      {hasError && <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent-red)]" />}
    </span>
  );
}

export function SidebarFooterMore({ showActivity, onActivity, needsYou, hasError, showScheduled, onScheduled, showUsage, onUsage, showStats, onStats, showMobile, onMobile, showSettings, onSettings, onFeedback }: SidebarFooterMoreProps) {
  const [open, setOpen] = useState(false);
  const ref = useOutsideClick<HTMLDivElement>(() => setOpen(false), open);
  useEventListener("keydown", (e) => {
    if (e.key === "Escape") setOpen(false);
  }, document, open);
  const { running, unread } = useJobsAmbient();
  // Bound here rather than on the menu row so the shortcut keeps working while
  // the menu is closed.
  const shortcut = useAgentOverviewShortcut(onActivity);

  const itemClass = (active: boolean) =>
    `flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors ${
      active
        ? "bg-[var(--bg-active)] text-[var(--text-primary)]"
        : "text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
    }`;

  const pick = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };

  const hints = [
    needsYou > 0 ? `${needsYou} agent${needsYou === 1 ? "" : "s"} waiting on you` : "",
    hasError ? "an agent hit an error" : "",
    running > 0 ? "a scheduled job is running" : "",
    unread > 0 ? `${unread} automation${unread === 1 ? "" : "s"} with new messages` : "",
  ].filter(Boolean);

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors ${
          open || showActivity || showScheduled || showUsage || showStats || showMobile || showSettings
            ? "bg-[var(--bg-active)] text-[var(--text-primary)]"
            : "text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
        }`}
        title={hints.length > 0 ? `More — ${hints.join(", ")}` : "Activity, settings, and more views"}
        aria-label="More"
        aria-expanded={open}
      >
        <MoreHorizontalIcon />
        More
        <span className="ml-auto flex items-center gap-2">
          <ActivitySignals needsYou={needsYou} hasError={hasError} />
          {running > 0 ? (
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--accent-cyan)]" />
          ) : (
            <CountBadge count={unread} label="unread automations" />
          )}
        </span>
      </button>
      {open && (
        <div className={`absolute bottom-full left-0 z-[80] mb-1.5 w-full min-w-[12rem] px-1 ${MENU_PANEL_CLASS}`}>
          <button
            onClick={pick(onActivity)}
            className={itemClass(showActivity)}
            title="Every agent and automation across your projects, ordered by what is waiting on you."
          >
            <span className="shrink-0">
              <LayersIcon />
            </span>
            Activity
            <span className="ml-auto flex items-center gap-2">
              <ActivitySignals needsYou={needsYou} hasError={hasError} />
              {shortcut && <kbd className="shrink-0 text-[10px] opacity-50">{shortcut}</kbd>}
            </span>
          </button>
          <button onClick={pick(onScheduled)} className={itemClass(showScheduled)}>
            <span className="shrink-0">
              <HistoryIcon />
            </span>
            Automations
            {running > 0 ? (
              <span className="ml-auto flex items-center gap-1.5 text-[10px] font-medium text-[var(--accent-cyan)]">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--accent-cyan)]" />
                Running
              </span>
            ) : (
              <CountBadge count={unread} label="unread automations" className="ml-auto" />
            )}
          </button>
          <button onClick={pick(onUsage)} className={itemClass(showUsage)}>
            <span className="shrink-0">
              <ZapIcon />
            </span>
            Usage
          </button>
          <button onClick={pick(onStats)} className={itemClass(showStats)}>
            <span className="shrink-0">
              <StatsIcon />
            </span>
            Stats
          </button>
          <button onClick={pick(onMobile)} className={itemClass(showMobile)}>
            <span className="shrink-0">
              <SmartphoneIcon />
            </span>
            Mobile app
          </button>
          <div className="my-1 h-px bg-[var(--border)]" />
          <button onClick={pick(onSettings)} className={itemClass(showSettings)}>
            <span className="shrink-0">
              <SettingsIcon />
            </span>
            Settings
          </button>
          <button onClick={pick(onFeedback)} className={itemClass(false)}>
            <span className="shrink-0">
              <MessageIcon />
            </span>
            Support &amp; Feedback
          </button>
        </div>
      )}
    </div>
  );
}

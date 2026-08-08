import { useEffect, useState } from "react";
import { EventsOn } from "../../bridge/runtime";
import { ListAllJobs } from "../../bridge/commands";
import { useEventListener } from "../hooks/useEventListener";
import { useOutsideClick } from "../hooks/useOutsideClick";
import {
  HistoryIcon,
  MessageIcon,
  MoreHorizontalIcon,
  SettingsIcon,
  SmartphoneIcon,
  StatsIcon,
  ZapIcon,
} from "./icons";
import { MENU_PANEL_CLASS } from "./ui/ContextMenuShell";

interface SidebarFooterMoreProps {
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

export function SidebarFooterMore({ showScheduled, onScheduled, showUsage, onUsage, showStats, onStats, showMobile, onMobile, showSettings, onSettings, onFeedback }: SidebarFooterMoreProps) {
  const [open, setOpen] = useState(false);
  const ref = useOutsideClick<HTMLDivElement>(() => setOpen(false), open);
  useEventListener("keydown", (e) => {
    if (e.key === "Escape") setOpen(false);
  }, document, open);
  const { running, unread } = useJobsAmbient();

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

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors ${
          open || showScheduled || showUsage || showStats || showMobile || showSettings
            ? "bg-[var(--bg-active)] text-[var(--text-primary)]"
            : "text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
        }`}
        title={
          running > 0
            ? "More — a scheduled job is running"
            : unread > 0
              ? `More — ${unread} automation${unread === 1 ? "" : "s"} with new results`
              : "Settings and more views"
        }
        aria-label="More"
        aria-expanded={open}
      >
        <MoreHorizontalIcon />
        More
        {running > 0 ? (
          <span className="ml-auto h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--accent-cyan)]" />
        ) : (
          unread > 0 && (
            <span className="ml-auto rounded-full bg-[var(--accent-blue)] px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">
              {unread}
            </span>
          )
        )}
      </button>
      {open && (
        <div className={`absolute bottom-full left-0 z-[80] mb-1.5 w-full min-w-[12rem] px-1 ${MENU_PANEL_CLASS}`}>
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
            ) : unread > 0 ? (
              <span className="ml-auto rounded-full bg-[var(--accent-blue)] px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">
                {unread}
              </span>
            ) : (
              <span className="ml-auto rounded-full bg-[var(--accent-cyan)]/10 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-[var(--accent-cyan)]">
                Beta
              </span>
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

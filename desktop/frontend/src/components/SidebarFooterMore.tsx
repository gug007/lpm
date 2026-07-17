import { useEffect, useState } from "react";
import { Workflow } from "lucide-react";
import { EventsOn } from "../../bridge/runtime";
import { ListAllJobs } from "../../bridge/commands";
import { useEventListener } from "../hooks/useEventListener";
import { useOutsideClick } from "../hooks/useOutsideClick";
import { MessageIcon, MoreHorizontalIcon } from "./icons";
import { MENU_PANEL_CLASS } from "./ui/ContextMenuShell";

interface SidebarFooterMoreProps {
  showScheduled: boolean;
  onScheduled: () => void;
  onFeedback: () => void;
}

// Ambient scheduled-job state for the footer: how many jobs are running, and
// whether a run failed since the user last looked at the Scheduled view. A
// headless run is otherwise invisible outside a transient toast.
function useJobsAmbient(showScheduled: boolean): {
  running: number;
  attention: boolean;
} {
  const [running, setRunning] = useState(0);
  const [attention, setAttention] = useState(false);
  useEffect(() => {
    let alive = true;
    const refresh = () => {
      ListAllJobs()
        .then((rows) => {
          if (!alive) return;
          const list = Array.isArray(rows) ? (rows as { running?: boolean }[]) : [];
          setRunning(list.filter((r) => r.running === true).length);
        })
        .catch(() => {});
    };
    refresh();
    const cancel = EventsOn("job-status", (payload: { result?: string }) => {
      refresh();
      if (payload?.result === "error" || payload?.result === "timed-out") {
        setAttention(true);
      }
    });
    return () => {
      alive = false;
      if (typeof cancel === "function") cancel();
    };
  }, []);
  // Looking at the Scheduled view is the acknowledgement.
  useEffect(() => {
    if (showScheduled) setAttention(false);
  }, [showScheduled]);
  return { running, attention };
}

export function SidebarFooterMore({ showScheduled, onScheduled, onFeedback }: SidebarFooterMoreProps) {
  const [open, setOpen] = useState(false);
  const ref = useOutsideClick<HTMLDivElement>(() => setOpen(false), open);
  useEventListener("keydown", (e) => {
    if (e.key === "Escape") setOpen(false);
  }, document, open);
  const { running, attention } = useJobsAmbient(showScheduled);

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
        className={`relative flex h-full w-8 items-center justify-center rounded-md transition-colors ${
          open || showScheduled
            ? "bg-[var(--bg-active)] text-[var(--text-primary)]"
            : "text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
        }`}
        title={
          attention
            ? "More views — a scheduled job hit a problem"
            : running > 0
              ? "More views — a scheduled job is running"
              : "More views"
        }
        aria-label="More views"
        aria-expanded={open}
      >
        <MoreHorizontalIcon />
        {attention ? (
          <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-[var(--accent-red)]" />
        ) : (
          running > 0 && (
            <span className="absolute right-1 top-1 h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--accent-cyan)]" />
          )
        )}
      </button>
      {open && (
        <div className={`absolute bottom-full right-0 z-[80] mb-1.5 w-48 px-1 ${MENU_PANEL_CLASS}`}>
          <button onClick={pick(onScheduled)} className={itemClass(showScheduled)}>
            <Workflow className="shrink-0" size={16} strokeWidth={2} />
            Automations
            {running > 0 ? (
              <span className="ml-auto flex items-center gap-1.5 text-[10px] font-medium text-[var(--accent-cyan)]">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--accent-cyan)]" />
                Running
              </span>
            ) : (
              <span className="ml-auto rounded-full bg-[var(--accent-cyan)]/10 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-[var(--accent-cyan)]">
                Beta
              </span>
            )}
          </button>
          <button onClick={pick(onFeedback)} className={itemClass(false)}>
            <MessageIcon />
            Send feedback
          </button>
        </div>
      )}
    </div>
  );
}

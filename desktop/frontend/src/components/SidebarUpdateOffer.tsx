import { ArrowRight, ExternalLink } from "lucide-react";
import { useEffect, useId, useRef, useState, type FocusEvent } from "react";
import { UPDATES_INSTALL_IN_APP } from "../releasePage";
import { loadReleaseNotes } from "../store/releaseNotes";
import { SidebarRowPopover } from "./SidebarRowPopover";
import { UpdateTimelineCard } from "./UpdateTimelineCard";

export const UPDATE_NOTES_HOVER_MS = 250;
const TIMELINE_WIDTH = 320;

interface SidebarUpdateOfferProps {
  currentVersion: string;
  latestVersion: string;
  className: string;
  onUpdate: () => void;
}

// The running version sits beside the new one so the row can't be read as the
// version you have; resting on it lists what every release in between brought.
export function SidebarUpdateOffer({ currentVersion, latestVersion, className, onUpdate }: SidebarUpdateOfferProps) {
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const timer = useRef<number | null>(null);
  const popoverId = useId();
  const target = latestVersion || "update";
  const explains = Boolean(currentVersion && latestVersion);

  useEffect(() => {
    if (explains) loadReleaseNotes(currentVersion, latestVersion);
  }, [explains, currentVersion, latestVersion]);

  const clearTimer = () => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  };
  useEffect(() => clearTimer, []);

  const show = (row: HTMLElement, delay: number) => {
    if (!explains) return;
    clearTimer();
    loadReleaseNotes(currentVersion, latestVersion);
    const rect = row.getBoundingClientRect();
    timer.current = window.setTimeout(() => setAnchor(rect), delay);
  };
  const hide = () => {
    clearTimer();
    setAnchor(null);
  };
  const showOnKeyboardFocus = (e: FocusEvent<HTMLButtonElement>) => {
    if (e.currentTarget.matches(":focus-visible")) show(e.currentTarget, 0);
  };

  return (
    <>
      <button
        onClick={() => {
          hide();
          onUpdate();
        }}
        onMouseEnter={(e) => show(e.currentTarget, UPDATE_NOTES_HOVER_MS)}
        onMouseLeave={hide}
        onFocus={showOnKeyboardFocus}
        onBlur={hide}
        aria-label={`${UPDATES_INSTALL_IN_APP ? "Update to" : "Download"} ${target}`}
        aria-describedby={anchor ? popoverId : undefined}
        className={className}
      >
        {currentVersion && (
          <>
            <span className="shrink-0 text-xs tabular-nums text-[var(--text-muted)]">{currentVersion}</span>
            <ArrowRight size={11} className="shrink-0 text-[var(--text-muted)]" />
          </>
        )}
        <span className="min-w-0 truncate text-xs font-medium tabular-nums text-[var(--text-primary)]">
          {latestVersion}
        </span>
        <span className="ml-auto flex shrink-0 items-center gap-1 text-[10px] font-medium text-[var(--accent-green-text)]">
          {UPDATES_INSTALL_IN_APP ? "Update" : "Download"}
          {!UPDATES_INSTALL_IN_APP && <ExternalLink size={10} />}
        </span>
      </button>
      {anchor && (
        <SidebarRowPopover anchor={anchor} width={TIMELINE_WIDTH} id={popoverId}>
          <UpdateTimelineCard since={currentVersion} until={latestVersion} />
        </SidebarRowPopover>
      )}
    </>
  );
}

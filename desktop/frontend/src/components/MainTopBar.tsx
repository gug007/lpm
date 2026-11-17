import { type CSSProperties } from "react";
import { chordLabel } from "../keys";
import { SidebarIcon } from "./icons";

// Where a page title in the title-bar row starts while the sidebar is folded
// away: just past the expand button below, which sits after the traffic lights
// (85px + 20px + a 7px gap), or at the window's edge in fullscreen and with
// native chrome (12px + 20px + 12px).
export function collapsedTitleInset(isFullscreen: boolean): string {
  return isFullscreen ? "pl-11" : "pl-[112px] native-chrome:pl-11";
}

export function MainTopBar({
  sidebarCollapsed,
  isFullscreen,
  onExpand,
}: {
  sidebarCollapsed: boolean;
  isFullscreen: boolean;
  onExpand: () => void;
}) {
  return (
    <div className="app-drag flex h-2 shrink-0 items-center">
      <div
        className={`absolute top-[18px] native-chrome:top-[16px] z-10 ${isFullscreen ? "left-3" : "left-[85px] native-chrome:left-3"} ${sidebarCollapsed ? "opacity-100" : "opacity-0 pointer-events-none"}`}
      >
        <button
          onClick={onExpand}
          style={{ "--app-draggable": "no-drag" } as CSSProperties}
          className="flex h-5 w-5 items-center justify-center rounded text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
          title={`Expand sidebar (${chordLabel({ key: "b", meta: true })})`}
        >
          <SidebarIcon />
        </button>
      </div>
    </div>
  );
}

import { type CSSProperties } from "react";
import { chordLabel } from "../keys";
import { SidebarIcon } from "./icons";

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
        className={`absolute top-[16px] z-10 ${isFullscreen ? "left-3" : "left-[85px] native-chrome:left-3"} ${sidebarCollapsed ? "opacity-100" : "opacity-0 pointer-events-none"}`}
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

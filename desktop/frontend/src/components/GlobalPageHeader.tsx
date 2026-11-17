import type { ComponentProps } from "react";
import { useIsFullscreen } from "../hooks/useIsFullscreen";
import { useAppStore } from "../store/app";
import { collapsedTitleInset } from "./MainTopBar";
import { PageHeader } from "./ui/PageHeader";

// The measure an app-wide page keeps its content to when it reads as a list
// rather than a dashboard, starting at the same edge as its header.
export const GLOBAL_COLUMN = "w-full max-w-[848px]";

// The header of an app-wide page (Stats, Ports, Automations). Every one puts its
// title in the window's title-bar row at the same place, and steps clear of the
// traffic lights while the sidebar is folded away. `column` keeps its actions
// over a page held to GLOBAL_COLUMN.
export function GlobalPageHeader({
  column = false,
  ...props
}: Omit<ComponentProps<typeof PageHeader>, "className"> & { column?: boolean }) {
  const sidebarCollapsed = useAppStore((s) => s.sidebarCollapsed);
  const isFullscreen = useIsFullscreen();
  return (
    <div
      className={`app-drag -mx-6 shrink-0 px-6 pt-1 transition-[padding] duration-200 ${
        sidebarCollapsed ? collapsedTitleInset(isFullscreen) : ""
      }`}
    >
      <div className={column ? GLOBAL_COLUMN : ""}>
        <PageHeader {...props} className="mb-0" />
      </div>
    </div>
  );
}

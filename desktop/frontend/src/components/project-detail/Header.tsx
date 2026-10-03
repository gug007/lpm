import { type MouseEvent, type ReactNode, type RefObject } from "react";

interface HeaderProps {
  projectName: string;
  showProjectName: boolean;
  sidebarCollapsed: boolean;
  rowRef: RefObject<HTMLDivElement | null>;
  innerRef: RefObject<HTMLDivElement | null>;
  actionsWrapped: boolean;
  actions: ReactNode;
  controls: ReactNode;
  trailing?: ReactNode;
  // A side-by-side column the user isn't working in.
  dimmed?: boolean;
  alignTop?: boolean;
  // Right-clicks on the row; the project view opens its row menu on empty space.
  onRowContextMenu?: (e: MouseEvent<HTMLDivElement>) => void;
}

export function Header({
  projectName,
  showProjectName,
  sidebarCollapsed,
  rowRef,
  innerRef,
  actionsWrapped,
  actions,
  controls,
  trailing,
  dimmed = false,
  alignTop = false,
  onRowContextMenu,
}: HeaderProps) {
  const indent = sidebarCollapsed ? "pl-[100px]" : "";
  const align = alignTop ? "items-start" : "items-center";
  return (
    <>
      <div
        ref={rowRef}
        onContextMenu={onRowContextMenu}
        className={`app-drag flex ${align} gap-4 -mx-3 py-1 transition-[padding] duration-200 ${indent}`}
      >
        {showProjectName && (
          <h1
            className={`shrink-0 text-xl font-semibold tracking-tight pr-2 transition-colors ${
              dimmed ? "text-[var(--text-muted)]" : ""
            } ${alignTop ? "leading-8" : ""}`}
          >
            {projectName}
          </h1>
        )}
        {/* Children keep their width so useOverflowWrap can see the overflow and wrap. */}
        <div ref={innerRef} className={`flex min-w-0 flex-1 ${align} justify-end gap-2 [&>*]:shrink-0`}>
          {!actionsWrapped && actions}
          {controls}
          {trailing}
        </div>
      </div>
      {actionsWrapped && (
        <div
          onContextMenu={onRowContextMenu}
          className={`app-drag -mx-3 mt-2 pb-1 transition-[padding] duration-200 ${indent}`}
        >
          {actions}
        </div>
      )}
    </>
  );
}

import { type ReactNode, type RefObject } from "react";

interface HeaderProps {
  projectName: string;
  showProjectName: boolean;
  sidebarCollapsed: boolean;
  rowRef: RefObject<HTMLDivElement | null>;
  innerRef: RefObject<HTMLDivElement | null>;
  actionsWrapped: boolean;
  actions: ReactNode;
  controls: ReactNode;
}

// Wails-drag title row. When the action row would overflow, the actions
// drop onto a second row underneath; useOverflowWrap drives the toggle.
export function Header({
  projectName,
  showProjectName,
  sidebarCollapsed,
  rowRef,
  innerRef,
  actionsWrapped,
  actions,
  controls,
}: HeaderProps) {
  const indent = sidebarCollapsed ? "pl-[100px]" : "";
  return (
    <>
      <div
        ref={rowRef}
        className={`wails-drag flex items-center gap-4 -mx-3 py-1 transition-[padding] duration-200 ${indent}`}
      >
        {showProjectName && (
          <h1 className="shrink-0 text-xl font-semibold tracking-tight pr-2">{projectName}</h1>
        )}
        <div ref={innerRef} className="flex min-w-0 flex-1 items-center justify-end gap-2">
          {!actionsWrapped && actions}
          {controls}
        </div>
      </div>
      {actionsWrapped && (
        <div className={`wails-drag -mx-3 mt-2 pb-1 transition-[padding] duration-200 ${indent}`}>
          {actions}
        </div>
      )}
    </>
  );
}

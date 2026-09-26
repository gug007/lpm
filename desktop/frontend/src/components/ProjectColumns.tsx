import { useEffect } from "react";
import { ProjectDetail } from "./ProjectDetail";
import { useAppStore } from "../store/app";
import { useSideBySide, useSideBySideColumns } from "../store/sideBySide";
import { gridShape } from "../sideBySide";
import type { ProjectInfo } from "../types";

interface ProjectColumnsProps {
  // Every mounted project detail; App keeps visited ones alive so their
  // terminals survive a switch.
  mounted: ProjectInfo[];
  showing: boolean;
  selected: string | null;
  sidebarCollapsed: boolean;
  onStart: (name: string, profile: string) => Promise<void>;
  onToggleService: (name: string, serviceName: string) => Promise<void>;
  onStop: (name: string) => Promise<void>;
  onRefresh: (newName?: string) => void;
}

// The selected project on its own, or the side-by-side set as a grid of
// columns. The wrapper and each detail's key stay the same in both layouts, so
// switching never remounts a project (and its live terminals).
export function ProjectColumns({
  mounted,
  showing,
  selected,
  sidebarCollapsed,
  onStart,
  onToggleService,
  onStop,
  onRefresh,
}: ProjectColumnsProps) {
  const projects = useAppStore((s) => s.projects);
  const selectProject = useAppStore((s) => s.selectProject);
  const names = useSideBySide((s) => s.names);
  const leave = useSideBySide((s) => s.remove);
  const close = useSideBySide((s) => s.close);
  const prune = useSideBySide((s) => s.prune);
  const onScreen = useSideBySideColumns(selected);

  useEffect(() => {
    if (names.length > 0 && projects.length > 0) prune(new Set(projects.map((p) => p.name)));
  }, [names.length, projects, prune]);

  useEffect(() => {
    if (selected !== null && names.length > 0 && !names.includes(selected)) close();
  }, [selected, names, close]);

  const columns = showing ? onScreen : [];
  const split = columns.length >= 2;
  const { cols, rows } = gridShape(columns.length);

  return (
    <div
      className={split ? "-mx-6 -mb-6 grid min-h-0 flex-1 gap-px bg-[var(--border)]" : "contents"}
      style={
        split
          ? {
              gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
              gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
            }
          : undefined
      }
    >
      {mounted.map((project) => {
        const index = columns.indexOf(project.name);
        const inGrid = split && index >= 0;
        const shown = showing && (split ? index >= 0 : selected === project.name);
        const focused = !inGrid || selected === project.name;
        return (
          <div
            key={project.name}
            data-project-column={inGrid ? (focused ? "active" : "passive") : undefined}
            onPointerDownCapture={
              inGrid && !focused ? () => selectProject(project.name) : undefined
            }
            className={
              !shown
                ? "hidden"
                : inGrid
                  ? `flex min-h-0 min-w-0 flex-col overflow-hidden bg-[var(--bg-primary)] px-6 pb-6 ${index >= cols ? "pt-3" : ""}`
                  : "flex min-h-0 flex-1 flex-col"
            }
            style={inGrid ? { order: index } : undefined}
          >
            <ProjectDetail
              project={project}
              visible={shown}
              focused={focused}
              sidebarCollapsed={sidebarCollapsed && (!inGrid || index === 0)}
              onCloseColumn={inGrid ? () => leave(project.name) : undefined}
              onStart={onStart}
              onToggleService={onToggleService}
              onStop={onStop}
              onRefresh={onRefresh}
            />
          </div>
        );
      })}
    </div>
  );
}

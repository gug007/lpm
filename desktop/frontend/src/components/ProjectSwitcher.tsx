import { useLayoutEffect, useRef } from "react";
import { Modal } from "./ui/Modal";
import { useAppStore } from "../store/app";
import { ProjectNameDisplay, findParentProject } from "./ProjectNameDisplay";

interface ProjectSwitcherProps {
  active: boolean;
  list: string[];
  index: number;
}

export function ProjectSwitcher({ active, list, index }: ProjectSwitcherProps) {
  const projects = useAppStore((s) => s.projects);
  const listRef = useRef<HTMLDivElement>(null);

  // Keep the highlighted row visible as Ctrl+Tab moves the selection.
  useLayoutEffect(() => {
    const row = listRef.current?.children[index] as HTMLElement | undefined;
    row?.scrollIntoView({ block: "nearest" });
  }, [active, index]);

  return (
    <Modal
      open={active}
      onClose={() => {}}
      backdrop={false}
      closeOnEscape={false}
      autoFocus={false}
      zIndexClassName="z-[70]"
    >
      <div className="switcher-in w-[min(340px,86vw)] overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)] p-2 shadow-2xl">
        <div className="px-2 pb-1.5 pt-1 text-[11px] font-medium uppercase tracking-wide text-[var(--text-muted)]">
          Switch project
        </div>
        <div ref={listRef} className="flex max-h-[60vh] flex-col gap-0.5 overflow-y-auto">
          {list.map((name, i) => {
            const project = projects.find((p) => p.name === name);
            return (
              <div
                key={name}
                className={`shrink-0 truncate rounded-lg px-3 py-2 text-sm ${
                  i === index
                    ? "bg-[var(--bg-hover)] text-[var(--text-primary)] ring-1 ring-inset ring-[var(--accent-cyan)]/40"
                    : "text-[var(--text-secondary)]"
                }`}
              >
                {project ? (
                  <ProjectNameDisplay
                    project={project}
                    parent={findParentProject(project, projects)}
                  />
                ) : (
                  name
                )}
              </div>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}

import { Modal } from "./ui/Modal";
import { usePrefersReducedMotion } from "../hooks/usePrefersReducedMotion";
import { useAppStore } from "../store/app";
import { ProjectNameDisplay, findParentProject } from "./ProjectNameDisplay";

interface ProjectSwitcherProps {
  active: boolean;
  list: string[];
  index: number;
}

export function ProjectSwitcher({ active, list, index }: ProjectSwitcherProps) {
  const reduceMotion = usePrefersReducedMotion();
  const projects = useAppStore((s) => s.projects);

  return (
    <Modal
      open={active}
      onClose={() => {}}
      backdrop={false}
      closeOnEscape={false}
      zIndexClassName="z-[70]"
    >
      <div
        style={{
          animation: reduceMotion
            ? undefined
            : "switcher-in 160ms cubic-bezier(0.2, 0.9, 0.3, 1) both",
        }}
        className="w-[min(340px,86vw)] overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)] p-2 shadow-2xl"
      >
        <div className="px-2 pb-1.5 pt-1 text-[11px] font-medium uppercase tracking-wide text-[var(--text-muted)]">
          Switch project
        </div>
        <div className="flex flex-col gap-0.5">
          {list.map((name, i) => {
            const highlighted = i === index;
            const project = projects.find((p) => p.name === name);
            return (
              <div
                key={name}
                className={`truncate rounded-lg px-3 py-2 text-sm ${
                  highlighted
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

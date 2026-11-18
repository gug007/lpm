import { computeProjectStatus, rowNameClass } from "../agentStatus";
import { useAppStore } from "../store/app";
import { ProjectNameDisplay, projectDisplayName } from "./ProjectNameDisplay";
import { ProjectStatusLight } from "./ProjectStatusLight";
import { DONE_STYLE, ROW_BASE_CLASS } from "./sidebarRowClass";

/** The archived project open for now, under the project list until something
 *  else is shown. It stays archived: this window is the only place that lists it. */
export function SidebarArchivedOpen({ width }: { width: number }) {
  const project = useAppStore((s) => s.projects.find((p) => p.archived));
  const selected = useAppStore((s) => s.view === "projects" && s.selected === project?.name);
  const selectProject = useAppStore((s) => s.selectProject);
  if (!project) return null;
  const status = computeProjectStatus(project.statusEntries);
  const nameClass = rowNameClass(status, false);
  const name = <ProjectNameDisplay project={project} />;

  return (
    <section aria-label="From the Archive" style={{ minWidth: width }}>
      <h2 className="pb-0.5 pl-[10px] pt-3 text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">
        From the Archive
      </h2>
      <button
        type="button"
        onClick={() => selectProject(project.name)}
        aria-current={selected ? "page" : undefined}
        className={`${ROW_BASE_CLASS} ${
          selected
            ? "bg-[var(--bg-active)] text-[var(--text-primary)]"
            : "text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
        }`}
      >
        <span className="flex h-5 w-3 shrink-0 items-center justify-center">
          <ProjectStatusLight project={project} />
        </span>
        <span
          className="min-w-0 flex-1 truncate"
          title={projectDisplayName(project)}
          style={status.isDone ? DONE_STYLE : undefined}
        >
          {nameClass ? <span className={nameClass}>{name}</span> : name}
        </span>
      </button>
    </section>
  );
}

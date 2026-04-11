import { type ProjectInfo } from "../types";

interface ProjectNameDisplayProps {
  project: ProjectInfo;
  parent?: ProjectInfo;
}

export function ProjectNameDisplay({ project, parent }: ProjectNameDisplayProps) {
  if (project.label) return <>{project.label}</>;
  const parentName = project.parentName;
  if (parent && parentName && project.name.startsWith(parentName + "-")) {
    const suffix = project.name.slice(parentName.length);
    return (
      <span className="text-[var(--text-muted)]">
        {parent.label || parent.name}
        {suffix}
      </span>
    );
  }
  return <>{project.name}</>;
}

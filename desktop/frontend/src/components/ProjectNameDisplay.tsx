import { type ProjectInfo } from "../types";

interface ProjectNameDisplayProps {
  project: ProjectInfo;
  parent?: ProjectInfo;
}

function duplicateDisplayName(project: ProjectInfo, parent?: ProjectInfo): string | null {
  const parentName = project.parentName;
  if (parent && parentName && project.name.startsWith(parentName + "-")) {
    return (parent.label || parent.name) + project.name.slice(parentName.length);
  }
  return null;
}

export function findParentProject(
  project: ProjectInfo | undefined,
  projects: ProjectInfo[],
): ProjectInfo | undefined {
  return project?.parentName
    ? projects.find((p) => p.name === project.parentName)
    : undefined;
}

export function projectDisplayName(project: ProjectInfo, parent?: ProjectInfo): string {
  return project.label || duplicateDisplayName(project, parent) || project.name;
}

export function ProjectNameDisplay({ project, parent }: ProjectNameDisplayProps) {
  const inherited = !project.label && duplicateDisplayName(project, parent);
  if (inherited) {
    return <span className="text-[var(--text-muted)]">{inherited}</span>;
  }
  return <>{projectDisplayName(project, parent)}</>;
}

import { type ProjectInfo } from "../types";

const MUTED_STYLE = { color: "var(--text-muted)" } as const;

interface ProjectNameDisplayProps {
  project: ProjectInfo;
  parent?: ProjectInfo;
}

export function ProjectNameDisplay({ project, parent }: ProjectNameDisplayProps) {
  if (project.label) return <>{project.label}</>;
  const parentName = project.parentName;
  if (parent && parentName && project.name.startsWith(parentName + "-")) {
    return (
      <>
        {parent.label || parent.name}
        <span style={MUTED_STYLE}>{project.name.slice(parentName.length)}</span>
      </>
    );
  }
  return <>{project.name}</>;
}

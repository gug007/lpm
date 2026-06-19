import type { ReactNode } from "react";
import type { ProjectInfo } from "../types";
import { projectDisplayName } from "./ProjectNameDisplay";

interface RemovalSummaryProps {
  lead: ReactNode;
  projects: ProjectInfo[];
  projectByName: Map<string, ProjectInfo>;
}

// Shared body for destructive removal dialogs (batch select + folder delete).
// Duplicates have their copy deleted from disk; originals only lose their lpm
// entry, so the two outcomes are spelled out separately.
export function RemovalSummary({ lead, projects, projectByName }: RemovalSummaryProps) {
  const foldersDeleted = projects.filter((p) => p.parentName).length;
  const entriesRemoved = projects.length - foldersDeleted;
  return (
    <>
      {lead}
      <ul className="mt-2 max-h-40 list-disc space-y-0.5 overflow-y-auto pl-5">
        {projects.map((p) => (
          <li key={p.name} className="text-[var(--text-primary)]">
            {projectDisplayName(p, projectByName.get(p.parentName ?? ""))}
          </li>
        ))}
      </ul>
      {foldersDeleted > 0 && (
        <span className="mt-2 block">
          {foldersDeleted === 1
            ? "1 copy and everything inside is permanently deleted from disk."
            : `${foldersDeleted} copies and everything inside are permanently deleted from disk.`}{" "}
          This can't be undone.
        </span>
      )}
      {entriesRemoved > 0 && (
        <span className="mt-2 block">
          {entriesRemoved === 1
            ? "1 project is removed from lpm; its source folder stays on disk."
            : `${entriesRemoved} projects are removed from lpm; their source folders stay on disk.`}
        </span>
      )}
    </>
  );
}

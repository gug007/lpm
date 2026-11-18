import { useAppStore } from "../../store/app";
import { openArchiveView, useProjectArchiveStore } from "../../store/projectArchive";
import type { ProjectInfo } from "../../types";
import { BarButton } from "../BarButton";
import { projectDisplayName } from "../ProjectNameDisplay";
import { StatusChip } from "../ui/StatusChip";

/** Above the archived project that is open for now: what that means, and the
 *  two ways out of it. Leaving for the Archive page closes it. */
export function ArchivedProjectBar({ project }: { project: ProjectInfo }) {
  const unarchive = useProjectArchiveStore((s) => s.unarchive);
  const running = useAppStore((s) => s.projects.some((p) => p.name === project.name && p.running));

  return (
    <div
      role="status"
      className="mb-2 flex items-center gap-2.5 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)]/40 px-3 py-1.5 text-[12px]"
    >
      <StatusChip tone="attention">Archived</StatusChip>
      <span className="min-w-0 flex-1 truncate text-[var(--text-secondary)]">
        Open from the Archive. Its automations stay paused, and it closes when you leave it.
      </span>
      <BarButton onClick={() => void unarchive([{ name: project.name, label: projectDisplayName(project) }])}>
        Unarchive
      </BarButton>
      <BarButton strong onClick={openArchiveView} title={running ? "Stops its services and closes it" : "Closes it"}>
        Close
      </BarButton>
    </div>
  );
}

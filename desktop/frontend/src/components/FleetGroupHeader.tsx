import type { FleetProjectIdentity } from "../fleetIdentity";
import { FleetTags } from "./FleetTags";

export interface FleetGroupHeaderProps {
  project: FleetProjectIdentity;
  onOpen: () => void;
}

export function FleetGroupHeader({ project, onOpen }: FleetGroupHeaderProps) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <button
        type="button"
        onClick={onOpen}
        className="min-w-0 truncate text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
      >
        {project.label}
      </button>
      <FleetTags project={project} />
    </div>
  );
}

import { StatusDot } from "./StatusDot";
import { peerRawName } from "../peer/markers";
import {
  type ProjectInfo,
  STATUS_RUNNING,
  STATUS_DONE,
  STATUS_WAITING,
  STATUS_ERROR,
} from "../types";

const ROW_BASE_CLASS =
  "flex w-full select-none items-center gap-3 rounded-md px-3 py-2 text-left text-sm outline-none transition-colors";

function statusClass(project: ProjectInfo): string | null {
  const entries = project.statusEntries ?? [];
  const has = (v: string) => entries.some((e) => e.value === v);
  if (has(STATUS_ERROR)) return "text-red-400";
  if (has(STATUS_WAITING)) return "sidebar-waiting";
  if (has(STATUS_RUNNING)) return "sidebar-shimmer";
  if (has(STATUS_DONE)) return null;
  return null;
}

// A connected peer's projects, rendered below the local projects as a flat,
// non-reorderable section headed by the peer's name. Selecting a row opens the
// exact same ProjectDetail a local project uses.
export function SidebarPeerSection({
  alias,
  projects,
  selected,
  onSelect,
}: {
  alias: string;
  projects: ProjectInfo[];
  selected: string | null;
  onSelect: (name: string) => void;
}) {
  if (projects.length === 0) return null;
  return (
    <div className="mt-3">
      <div className="flex items-center gap-1.5 px-3 pb-1 text-[10px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
        <span className="truncate">{alias}</span>
        <span className="shrink-0 opacity-70">— remote</span>
      </div>
      {projects.map((project) => {
        const isSelected = selected === project.name;
        const cls = statusClass(project);
        const label = project.label || peerRawName(project.name);
        return (
          <button
            key={project.name}
            onClick={() => onSelect(project.name)}
            className={`${ROW_BASE_CLASS} ${
              isSelected
                ? "bg-[var(--bg-active)] text-[var(--text-primary)]"
                : "text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
            }`}
          >
            <StatusDot running={project.running} />
            <span className="truncate" title={label}>
              {cls ? <span className={cls}>{label}</span> : label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

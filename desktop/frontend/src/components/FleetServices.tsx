import type { FleetServiceGroup } from "../fleetRows";
import { StatusDot } from "./StatusDot";

const CHIP_BASE =
  "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] transition-colors hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-blue)]";

const RUNNING_CLASS = "bg-[var(--bg-active)] text-[var(--text-secondary)]";
const STOPPED_CLASS = "border border-[var(--border)] text-[var(--text-muted)]";

export interface FleetServicesProps {
  groups: FleetServiceGroup[];
  onToggle: (project: string, service: string) => void;
  onOpenProject: (project: string) => void;
}

function chipsOf(group: FleetServiceGroup) {
  return [
    ...group.running.map((name) => ({ name, running: true })),
    ...group.declared.map((name) => ({ name, running: false })),
  ];
}

export function FleetServices({
  groups,
  onToggle,
  onOpenProject,
}: FleetServicesProps) {
  if (groups.length === 0) return null;
  const started = groups.reduce((sum, group) => sum + group.running.length, 0);

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)]">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
        <h2 className="text-sm font-medium">Services</h2>
        <span className="text-[11px] tabular-nums text-[var(--text-muted)]">
          {started} started in {groups.length}{" "}
          {groups.length === 1 ? "project" : "projects"}
        </span>
      </div>
      <div className="divide-y divide-[var(--border)]">
        {groups.map((group) => (
          <div
            key={group.project.name}
            className="flex items-start gap-3 px-4 py-2.5"
          >
            <button
              type="button"
              onClick={() => onOpenProject(group.project.name)}
              className="w-40 shrink-0 truncate text-left text-xs font-medium text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-blue)]"
              title={group.project.label}
            >
              {group.project.label}
            </button>
            <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
              {chipsOf(group).map((chip) => (
                <button
                  key={chip.name}
                  type="button"
                  onClick={() => onToggle(group.project.name, chip.name)}
                  title={
                    chip.running
                      ? "Started — click to stop"
                      : "Not started — click to start"
                  }
                  className={`${CHIP_BASE} ${chip.running ? RUNNING_CLASS : STOPPED_CLASS}`}
                >
                  <StatusDot running={chip.running} />
                  {chip.name}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

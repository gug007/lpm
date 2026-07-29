import type { FleetServiceGroup } from "../fleetRows";
import type { FleetServicePorts } from "../hooks/useFleetServicePorts";
import { FleetServiceRow } from "./FleetServiceRow";

export interface FleetServicesProps {
  groups: FleetServiceGroup[];
  detected: FleetServicePorts;
  onToggle: (project: string, service: string) => void;
  onOpenProject: (project: string) => void;
}

export function FleetServices({
  groups,
  detected,
  onToggle,
  onOpenProject,
}: FleetServicesProps) {
  if (groups.length === 0) return null;
  const running = groups.reduce((sum, group) => sum + group.running.length, 0);
  const total = groups.reduce((sum, group) => sum + group.declared.length, running);

  // Only a started service can be opened, and only where a port is known: the
  // one it is listening on, or the one it declares while detection catches up.
  const portOf = (group: FleetServiceGroup, service: string): number | null => {
    const live = detected[group.project.name]?.[service];
    if (live?.length) return live[0];
    const declared = group.ports[service];
    return declared > 0 ? declared : null;
  };

  return (
    <section className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
          Services
        </h2>
        <span className="text-[10px] tabular-nums text-[var(--text-muted)]">
          {running} of {total} running
        </span>
      </div>

      <div className="space-y-0.5">
        {groups.flatMap((group) =>
          [
            ...group.running.map((name) => ({ name, running: true })),
            ...group.declared.map((name) => ({ name, running: false })),
          ].map((service) => (
            <FleetServiceRow
              key={`${group.project.name}/${service.name}`}
              project={group.project}
              service={service.name}
              running={service.running}
              port={service.running ? portOf(group, service.name) : null}
              onToggle={() => onToggle(group.project.name, service.name)}
              onOpenProject={() => onOpenProject(group.project.name)}
            />
          )),
        )}
      </div>
    </section>
  );
}

import type { FleetChip, FleetServiceGroup } from "../fleetRows";
import type { FleetServicePorts } from "../hooks/useFleetServicePorts";
import { FleetServiceRow, type FleetServiceLink } from "./FleetServiceRow";

export interface FleetServicesProps {
  groups: FleetServiceGroup[];
  detected: FleetServicePorts;
  onRunChip: (project: string, chip: FleetChip) => void;
  onStop: (project: string) => void;
  onOpenProject: (project: string) => void;
}

export function FleetServices({
  groups,
  detected,
  onRunChip,
  onStop,
  onOpenProject,
}: FleetServicesProps) {
  if (groups.length === 0) return null;
  const running = groups.reduce((sum, group) => sum + group.running.length, 0);
  const total = groups.reduce((sum, group) => sum + group.declared.length, running);

  // Only a started service can be opened, and only where a port is known: the
  // one it is listening on, or the one it declares while detection catches up.
  const linksOf = (group: FleetServiceGroup): FleetServiceLink[] =>
    group.running.flatMap((service) => {
      const live = detected[group.project.name]?.[service];
      const port = live?.length ? live[0] : group.ports[service];
      return port > 0 ? [{ service, port }] : [];
    });

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
        {groups.map((group) => (
          <FleetServiceRow
            key={group.project.name}
            group={group}
            links={linksOf(group)}
            onRunChip={(chip) => onRunChip(group.project.name, chip)}
            onStop={() => onStop(group.project.name)}
            onOpenProject={() => onOpenProject(group.project.name)}
          />
        ))}
      </div>
    </section>
  );
}

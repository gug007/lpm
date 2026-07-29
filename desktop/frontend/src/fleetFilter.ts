import type { FleetRow, FleetServiceGroup } from "./fleetRows";

export type FleetKindFilter = "all" | "agents" | "services" | "automations";

export interface FleetFilter {
  query?: string;
  kind?: FleetKindFilter;
}

export interface FleetVisible {
  rows: FleetRow[];
  services: FleetServiceGroup[];
}

function matchesQuery(row: FleetRow, query: string): boolean {
  return (
    row.project.label.toLowerCase().includes(query) ||
    row.title.toLowerCase().includes(query) ||
    (row.tabTitle ?? "").toLowerCase().includes(query)
  );
}

/** A group whose project matches keeps all of its services; otherwise only the
 *  matching services stay, and a group left with none drops out. */
function filterGroup(
  group: FleetServiceGroup,
  query: string,
): FleetServiceGroup | null {
  if (group.project.label.toLowerCase().includes(query)) return group;
  const hit = (name: string) => name.toLowerCase().includes(query);
  const running = group.running.filter(hit);
  const declared = group.declared.filter(hit);
  if (running.length === 0 && declared.length === 0) return null;
  return { ...group, running, declared };
}

export function applyFleetFilter(
  rows: FleetRow[],
  services: FleetServiceGroup[],
  filter: FleetFilter | undefined,
): FleetVisible {
  const kind = filter?.kind ?? "all";
  const query = (filter?.query ?? "").trim().toLowerCase();

  let visibleRows = rows;
  if (kind === "services") visibleRows = [];
  else if (kind === "agents") visibleRows = rows.filter((r) => r.kind === "agent");
  else if (kind === "automations")
    visibleRows = rows.filter((r) => r.kind === "automation");

  let visibleServices = kind === "all" || kind === "services" ? services : [];

  if (query) {
    visibleRows = visibleRows.filter((row) => matchesQuery(row, query));
    visibleServices = visibleServices
      .map((group) => filterGroup(group, query))
      .filter((group): group is FleetServiceGroup => group !== null);
  }

  return { rows: visibleRows, services: visibleServices };
}

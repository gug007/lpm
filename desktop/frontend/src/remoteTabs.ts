import type { RemoteService } from "./store/peers";

// Map a service name to its (first) label port. The protocol's port is
// label/detection-only, so it's cosmetic — used to show "dev :9245" on a service
// terminal's tab, matching the local strip.
export function servicePortMap(services: RemoteService[] | undefined): Record<string, number> {
  const map: Record<string, number> = {};
  for (const s of services ?? []) {
    const p = s.port?.[0];
    if (typeof p === "number" && p > 0) map[s.name] = p;
  }
  return map;
}

// The port to show on a terminal tab, if that terminal is a service terminal
// (its desktop label is the service name) with a known port.
export function tabPort(label: string, ports: Record<string, number>): number | undefined {
  return ports[label];
}

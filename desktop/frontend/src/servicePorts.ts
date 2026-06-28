// Shape of one entry returned by the `detect_service_ports` command, and the
// shared parse into a name->ports map used by both the service-tab poller
// (useServicePorts) and the "Open in browser" menu (OpenInBrowserSubmenu).
export interface ServicePortsEntry {
  service: string;
  ports: number[];
}

export function parseServicePorts(res: unknown): Record<string, number[]> {
  const out: Record<string, number[]> = {};
  if (!Array.isArray(res)) return out;
  for (const entry of res as ServicePortsEntry[]) out[entry.service] = entry.ports ?? [];
  return out;
}

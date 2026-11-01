export const LOCAL_MACHINE = "local";

export interface ListeningPort {
  port: number;
  pid: number;
  process: string;
  // The owning project's name (peer-marked on a paired computer); empty when
  // nothing of lpm's holds the port.
  project: string;
  projectLabel: string;
  // The project this one is a copy of.
  parent: string;
  // Empty when a terminal tab's process holds the port rather than a service.
  service: string;
  terminal: string;
  // lpm itself: its phone server or a tunnel to a paired computer.
  own: boolean;
  // Unix seconds; 0 when unknown.
  startedAt: number;
  machine: string;
  machineName: string;
}

export interface PortsMachine {
  id: string;
  name: string;
  platform: string;
  local: boolean;
  connected: boolean;
  error?: string;
}

export interface PortsOverview {
  ports: ListeningPort[];
  machines: PortsMachine[];
}

export const portKey = (p: ListeningPort) => `${p.machine}:${p.port}:${p.pid}`;

export const isOutside = (p: ListeningPort) => !p.project && !p.own;

// Ports a project of yours holds on this computer: the sidebar row's count.
export function projectPortCount(ports: readonly ListeningPort[]): number {
  return ports.filter((p) => p.machine === LOCAL_MACHINE && p.project).length;
}

export function uptimeLabel(startedAt: number, nowMs: number): string {
  if (startedAt <= 0) return "";
  const secs = Math.max(0, Math.floor(nowMs / 1000) - startedAt);
  if (secs < 60) return "now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

// What the row says holds the port: the service, the terminal tab, or the
// process when lpm didn't start it.
export function holderName(p: ListeningPort): string {
  if (p.own) return "lpm";
  if (p.service) return p.service;
  if (p.project) return p.terminal || p.process || "terminal";
  return p.process || "unknown";
}

// "3000", ":3000", a service, project, process or computer name.
export function matchesFilter(p: ListeningPort, query: string): boolean {
  const q = query.trim().toLowerCase().replace(/^:/, "");
  if (!q) return true;
  if (/^\d+$/.test(q)) return String(p.port).startsWith(q);
  return [p.service, p.terminal, p.projectLabel, p.project, p.process, p.machineName]
    .some((field) => field.toLowerCase().includes(q));
}

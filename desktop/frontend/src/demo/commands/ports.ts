import type { ListeningPort } from "../../components/ports/portsModel";
import type { CommandMap } from "../backend";
import { projects } from "./state";

const MACHINE_NAME = "MacBook Pro";
const HOUR = 3600;

// Processes the sample workspace's computer runs outside lpm: a database left
// running from another session, and a port macOS itself keeps.
const OUTSIDE: Omit<ListeningPort, "machine" | "machineName" | "startedAt">[] = [
  { port: 5432, pid: 812, process: "postgres", project: "", projectLabel: "", parent: "", service: "", terminal: "", own: false },
  { port: 7000, pid: 491, process: "ControlCenter", project: "", projectLabel: "", parent: "", service: "", terminal: "", own: false },
];
const OUTSIDE_AGE = [3 * 24 * HOUR, 5 * 24 * HOUR];

const killed = new Set<number>();

function rows(): ListeningPort[] {
  const now = Math.floor(Date.now() / 1000);
  const taken = new Set<number>();
  const out: ListeningPort[] = [];
  let pid = 4100;
  for (const p of projects.values()) {
    if (p.remote) continue;
    for (const svc of p.services) {
      pid += 7;
      if (!p.running.has(svc.name) || !svc.port || taken.has(svc.port)) continue;
      taken.add(svc.port);
      out.push({
        port: svc.port,
        pid,
        process: "node",
        project: p.name,
        projectLabel: p.label || p.name,
        parent: p.parentName ?? "",
        service: svc.name,
        terminal: "",
        own: false,
        startedAt: now - 41 * 60 - out.length * 7 * 60,
        machine: "local",
        machineName: MACHINE_NAME,
      });
    }
  }
  OUTSIDE.forEach((row, i) => {
    if (killed.has(row.pid) || taken.has(row.port)) return;
    out.push({ ...row, startedAt: now - OUTSIDE_AGE[i], machine: "local", machineName: MACHINE_NAME });
  });
  return out.sort((a, b) => a.port - b.port);
}

export const portCommands: CommandMap = {
  list_ports_overview: () => ({
    ports: rows(),
    machines: [{ id: "local", name: MACHINE_NAME, platform: "macos", local: true, connected: true }],
  }),
  kill_port_holder: ({ pid }) => {
    killed.add(Number(pid));
    return null;
  },
};

import { useRef } from "react";
import { ListPortsOverview } from "../../bridge/commands";
import type { ListeningPort, PortsOverview } from "../components/ports/portsModel";
import { isPeerName } from "../peer/markers";
import { layoutShows, type SidebarRowLayout } from "../sidebarRowLayout";
import { useRowPorts } from "../store/rowPorts";
import type { ProjectInfo } from "../types";
import { useSweep, type SweepTiming } from "./useSweep";

const SWEEP_TIMING: SweepTiming = { firstDelayMs: 0, everyMs: 30_000, focusThrottleMs: 10_000 };

function portsByProject(ports: readonly ListeningPort[]): Record<string, number[]> {
  const out: Record<string, Set<number>> = {};
  for (const p of ports) {
    if (!p.project || p.own) continue;
    (out[p.project] ??= new Set()).add(p.port);
  }
  return Object.fromEntries(Object.entries(out).map(([name, set]) => [name, [...set].sort((a, b) => a - b)]));
}

// Which ports each project listens on, while a row shows them: every half
// minute the window is on screen, and on focus. A connected computer is asked
// only when one of its projects is in the list.
export function useRowPortsPoller(projects: ProjectInfo[], layout: SidebarRowLayout): void {
  const wanted = layoutShows(layout, "ports");
  const withPeers = projects.some((p) => isPeerName(p.name));
  const peersRef = useRef(withPeers);
  peersRef.current = withPeers;

  useSweep(
    async () => {
      try {
        const overview = (await ListPortsOverview(peersRef.current)) as PortsOverview | null;
        if (overview) useRowPorts.getState().set(portsByProject(overview.ports ?? []));
      } catch {
        // The last answer stands until the next one.
      }
    },
    wanted,
    SWEEP_TIMING,
    [withPeers],
  );
}

import { useCallback, useEffect, useRef } from "react";
import { ListPortsOverview } from "../../bridge/commands";
import type { ListeningPort, PortsOverview } from "../components/ports/portsModel";
import { isPeerName } from "../peer/markers";
import { layoutShows, type SidebarRowLayout } from "../sidebarRowLayout";
import { useRowPorts } from "../store/rowPorts";
import type { ProjectInfo } from "../types";
import { useEventListener } from "./useEventListener";

export const PORTS_EVERY_MS = 30_000;
const FOCUS_THROTTLE_MS = 10_000;

export function portsByProject(ports: readonly ListeningPort[]): Record<string, number[]> {
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
  const loading = useRef(false);
  const lastLoad = useRef(0);

  const load = useCallback(async () => {
    if (loading.current || document.hidden) return;
    loading.current = true;
    lastLoad.current = Date.now();
    try {
      const overview = (await ListPortsOverview(peersRef.current)) as PortsOverview | null;
      if (overview) useRowPorts.getState().set(portsByProject(overview.ports ?? []));
    } catch {
      // The last answer stands until the next one.
    } finally {
      loading.current = false;
    }
  }, []);

  useEffect(() => {
    if (!wanted) return;
    void load();
    const timer = setInterval(() => void load(), PORTS_EVERY_MS);
    return () => clearInterval(timer);
  }, [wanted, withPeers, load]);

  const onFocus = useCallback(() => {
    if (Date.now() - lastLoad.current >= FOCUS_THROTTLE_MS) void load();
  }, [load]);
  useEventListener("focus", onFocus, window, wanted);
}

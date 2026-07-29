import { useEffect, useMemo, useState } from "react";
import { DetectServicePorts } from "../../bridge/commands";
import type { FleetServiceGroup } from "../fleetRows";
import { parseServicePorts, samePorts } from "../servicePorts";

/** Project name -> service name -> the ports it is listening on. */
export type FleetServicePorts = Record<string, Record<string, number[]>>;

// A service that just started hasn't bound its port yet, so a first look can
// come back empty. One retry, narrowed to the projects that came back short,
// covers that gap. Detection scans the whole machine per project, so polling
// every project — what a single project's service tab does for one — would
// cost far more than the links are worth.
const RETRY_MS = 2500;

interface Target {
  name: string;
  running: string[];
}

type Detected = Record<string, Record<string, number[]> | null>;

/** Keeps the previous map when nothing moved, so a settled fleet stops
 *  re-rendering. A project whose detection failed keeps what it had. */
function merged(
  prev: FleetServicePorts,
  targets: Target[],
  found: Detected,
): FleetServicePorts {
  const next: FleetServicePorts = {};
  let changed = Object.keys(prev).length !== targets.length;
  for (const target of targets) {
    const ports = found[target.name] ?? prev[target.name] ?? {};
    next[target.name] = ports;
    if (!changed && !samePorts(prev[target.name] ?? {}, ports)) changed = true;
  }
  return changed ? next : prev;
}

export function useFleetServicePorts(
  groups: FleetServiceGroup[],
): FleetServicePorts {
  const targets = useMemo<Target[]>(
    () =>
      groups
        .filter((group) => group.running.length > 0)
        .map((group) => ({ name: group.project.name, running: group.running })),
    [groups],
  );
  // The fleet is rebuilt far more often than a service starts or stops, so
  // detection keys off what is running rather than off `targets` itself.
  const key = useMemo(() => JSON.stringify(targets), [targets]);
  const [ports, setPorts] = useState<FleetServicePorts>({});

  useEffect(() => {
    if (key === "[]") {
      setPorts((prev) => (Object.keys(prev).length === 0 ? prev : {}));
      return;
    }
    let cancelled = false;
    let timer: number | undefined;

    const detect = async (pending: Target[], retry: boolean) => {
      const found: Detected = {};
      await Promise.all(
        pending.map(async (target) => {
          try {
            found[target.name] = parseServicePorts(
              await DetectServicePorts(target.name),
            );
          } catch {
            found[target.name] = null;
          }
        }),
      );
      if (cancelled) return;
      setPorts((prev) => merged(prev, targets, found));
      if (!retry) return;
      const short = pending.filter((target) =>
        target.running.some((service) => !found[target.name]?.[service]?.length),
      );
      if (short.length > 0) {
        timer = window.setTimeout(() => void detect(short, false), RETRY_MS);
      }
    };

    void detect(targets, true);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // `targets` is what `key` is built from: same key, same targets.
  }, [key]);

  return ports;
}

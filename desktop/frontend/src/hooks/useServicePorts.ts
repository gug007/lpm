import { useEffect, useState } from "react";
import { DetectServicePorts } from "../../bridge/commands";
import { parseServicePorts } from "../servicePorts";

// Ports arrive sorted+deduped from the backend, so an element-wise compare is
// enough to tell whether anything changed — lets us keep the previous object
// reference and skip a pane-tree re-render on every (usually-identical) poll.
function samePorts(
  a: Record<string, number[]>,
  b: Record<string, number[]>,
): boolean {
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  for (const key of keys) {
    const av = a[key];
    const bv = b[key];
    if (!bv || av.length !== bv.length) return false;
    for (let i = 0; i < av.length; i++) if (av[i] !== bv[i]) return false;
  }
  return true;
}

// Live TCP-listen ports per running service, polled while the project runs.
// A freshly-started service hasn't bound its port yet, so the map fills in over
// the first few polls. `running` flips the poller off (and clears) once stopped;
// `serviceKey` (the joined running-service names) re-arms it when the set changes.
export function useServicePorts(
  projectName: string,
  running: boolean,
  serviceKey: string,
): Record<string, number[]> {
  const [ports, setPorts] = useState<Record<string, number[]>>({});

  useEffect(() => {
    if (!running) {
      setPorts({});
      return;
    }
    let cancelled = false;

    const poll = async () => {
      try {
        const next = parseServicePorts(await DetectServicePorts(projectName));
        if (cancelled) return;
        setPorts((prev) => (samePorts(prev, next) ? prev : next));
      } catch {
        // Detection is best-effort; a transient lsof/tmux failure just keeps
        // the last known ports until the next tick.
      }
    };

    poll();
    const id = setInterval(poll, 3000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [projectName, running, serviceKey]);

  return ports;
}

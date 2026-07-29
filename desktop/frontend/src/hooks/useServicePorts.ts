import { useEffect, useState } from "react";
import { DetectServicePorts } from "../../bridge/commands";
import { parseServicePorts, samePorts } from "../servicePorts";

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

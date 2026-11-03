import { useEffect } from "react";
import { toast } from "../notifications/toast";
import { EventsOn } from "../../bridge/runtime";
import { MACHINE as M } from "../machineWords";
import { countOf } from "../components/ignored/syncWords";

interface Served {
  machine: string;
  op: "read" | "write";
  files: number;
  path: string;
}

// Says when a paired computer's agent copied files from or onto this one
// (peer/agentfiles.rs), so it never happens unseen.
export function useAgentFilesServedNotices(): void {
  useEffect(
    () =>
      EventsOn("agent-files-served", (event: Served) => {
        const way = event.op === "read" ? `from ${M.thisMachine}` : `to ${M.thisMachine}`;
        toast(`${event.machine}'s agent copied ${countOf(event.files, "file")} ${way}`, {
          description: event.path,
          event: "peers",
        });
      }),
    [],
  );
}

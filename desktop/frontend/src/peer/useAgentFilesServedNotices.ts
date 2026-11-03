import { useEffect } from "react";
import { toast } from "../notifications/toast";
import { EventsOn } from "../../bridge/runtime";
import { MACHINE as M } from "../machineWords";
import { countOf } from "../components/ignored/syncWords";

type Served =
  | { machine: string; op: "read" | "write"; files: number; path: string }
  | { machine: string; op: "run"; command: string };

// Says when a paired computer's agent copied files from or onto this one
// (peer/agentfiles.rs), or starts a command here (peer/agentexec.rs), so it
// never happens unseen.
export function useAgentFilesServedNotices(): void {
  useEffect(
    () =>
      EventsOn("agent-files-served", (event: Served) => {
        if (event.op === "run") {
          toast(`${event.machine}'s agent is running a command on ${M.thisMachine}`, {
            description: event.command,
            event: "peers",
          });
          return;
        }
        const way = event.op === "read" ? `from ${M.thisMachine}` : `to ${M.thisMachine}`;
        toast(`${event.machine}'s agent copied ${countOf(event.files, "file")} ${way}`, {
          description: event.path,
          event: "peers",
        });
      }),
    [],
  );
}

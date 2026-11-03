import { PeerHostSetAgentFiles } from "../../../bridge/commands";
import type { PeerHostDevice } from "../../peer/usePeerState";
import { runHereSummary } from "../../peer/agentFilesWords";
import { MACHINE as M } from "../../machineWords";
import { AgentRunLine } from "./AgentRunLine";

// Whether a paired computer's agents may run commands on this one, kept and
// enforced here.
export function AgentRunHereLine({ device, refresh }: { device: PeerHostDevice; refresh: () => Promise<void> }) {
  const on = !!device.agentRun;
  return (
    <AgentRunLine
      title={`Let its agents run commands on ${M.thisMachine}`}
      subtitle={runHereSummary(on)}
      on={on}
      save={(next) => PeerHostSetAgentFiles(device.id, undefined, undefined, next).then(refresh)}
    />
  );
}

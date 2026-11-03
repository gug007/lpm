import { PeerAgentFilesSet } from "../../../bridge/commands";
import type { PeerClient } from "../../peer/usePeerState";
import { runThereSummary } from "../../peer/agentFilesWords";
import { AgentRunLine } from "./AgentRunLine";

// Whether this computer's agents may run commands on a connected one. The other
// computer keeps the setting and holds every command to it.
export function AgentRunThereLine({ peer, refresh }: { peer: PeerClient; refresh: () => Promise<void> }) {
  const on = !!peer.agentRun;
  return (
    <AgentRunLine
      title="Let agents here run commands there"
      subtitle={runThereSummary(on)}
      on={on}
      save={(next) => PeerAgentFilesSet(peer.slug, undefined, undefined, next).then(refresh)}
    />
  );
}

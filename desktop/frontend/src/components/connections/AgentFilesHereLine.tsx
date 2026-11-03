import { PeerHostSetAgentFiles } from "../../../bridge/commands";
import type { PeerHostDevice } from "../../peer/usePeerState";
import { access, hereSummary, scope } from "../../peer/agentFilesWords";
import { MACHINE as M } from "../../machineWords";
import { DetailLine } from "./DetailLine";
import { AgentFilesSelects } from "./AgentFilesSelects";

// What a paired computer's agents may copy on this one, kept and enforced here.
export function AgentFilesHereLine({
  device,
  refresh,
}: {
  device: PeerHostDevice;
  refresh: () => Promise<void>;
}) {
  const a = access(device.agentFiles);
  const s = scope(device.agentScope);
  return (
    <DetailLine title={`Let its agents copy files on ${M.thisMachine}`} subtitle={hereSummary(a, s)}>
      <AgentFilesSelects
        access={a}
        scope={s}
        readLabel={`Copy from ${M.thisMachine}`}
        errorTitle="Couldn't change what its agents may copy"
        save={(next, nextScope) => PeerHostSetAgentFiles(device.id, next, nextScope).then(refresh)}
      />
    </DetailLine>
  );
}

import { PeerAgentFilesSet } from "../../../bridge/commands";
import type { PeerClient } from "../../peer/usePeerState";
import { access, scope, thereSummary } from "../../peer/agentFilesWords";
import { DetailLine } from "./DetailLine";
import { AgentFilesSelects } from "./AgentFilesSelects";

// What this computer's agents may copy on a connected one (`lpm cp`). The
// other computer keeps the setting and holds every copy to it.
export function AgentFilesLine({ peer, refresh }: { peer: PeerClient; refresh: () => Promise<void> }) {
  const a = access(peer.agentFiles);
  const s = scope(peer.agentScope);
  return (
    <DetailLine title="Let agents here copy files there" subtitle={thereSummary(a, s)}>
      <AgentFilesSelects
        access={a}
        scope={s}
        readLabel="Copy from it"
        errorTitle="Couldn't change what agents may copy"
        save={(next, nextScope) => PeerAgentFilesSet(peer.slug, next, nextScope).then(refresh)}
      />
    </DetailLine>
  );
}

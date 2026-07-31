import { usePeerState } from "../peer/usePeerState";
import { HostSection } from "./connections/HostSection";
import { ClientSection } from "./connections/ClientSection";
import { SyncSection } from "./connections/SyncSection";

// Two roles, one pane: let another machine control this one (host), and connect to
// machines this one drives (client). Both stay live via peer-state-changed.
export function ConnectionsPane() {
  const { state, refresh } = usePeerState();

  return (
    <div className="mt-2">
      <p className="mb-6 text-[12px] leading-relaxed text-[var(--text-muted)]">
        Connect this Mac to another Mac, or to a Linux server, and work across both from one place.
        A connected machine's projects appear in your sidebar and open just like local ones.
      </p>
      <HostSection host={state.host} refresh={refresh} />
      <ClientSection peers={state.peers} host={state.host} refresh={refresh} />
      {state.peers.length > 0 && <SyncSection peers={state.peers} />}
    </div>
  );
}

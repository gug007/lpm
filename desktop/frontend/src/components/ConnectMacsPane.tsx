import { usePeerState } from "../peer/usePeerState";
import { HostSection } from "./connect-macs/HostSection";
import { ClientSection } from "./connect-macs/ClientSection";
import { SyncSection } from "./connect-macs/SyncSection";

// Two roles, one pane: let another Mac control this one (host), and connect to
// Macs this one drives (client). Both stay live via peer-state-changed.
export function ConnectMacsPane() {
  const { state, refresh } = usePeerState();

  return (
    <div className="mt-2">
      <p className="mb-6 text-[12px] leading-relaxed text-[var(--text-muted)]">
        Pair two Macs to work across both from one place. A connected Mac's projects appear in your
        sidebar and open just like local ones.
      </p>
      <HostSection host={state.host} refresh={refresh} />
      <ClientSection peers={state.peers} refresh={refresh} />
      {state.peers.length > 0 && <SyncSection peers={state.peers} />}
    </div>
  );
}

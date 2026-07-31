import { usePeerState } from "../peer/usePeerState";
import { isLinuxHost } from "../peer/platform";
import { HostSection } from "./connections/HostSection";
import { MacsSection } from "./connections/MacsSection";
import { LinuxHostsSection } from "./connections/LinuxHostsSection";
import { SyncSection } from "./connections/SyncSection";

// Two roles, one pane, and the whole pane is ordered by them: what this Mac lets
// in, then what it reaches out to. The same machine can appear on both sides —
// that's a two-way setup, not a duplicate — so each list says which direction it
// is in its own heading.
//
// Linux hosts get their own list: they're headless servers you keep work running
// on, not machines someone is sitting at, and they're brought online differently.
export function ConnectionsPane() {
  const { state, refresh } = usePeerState();
  const linuxHosts = state.peers.filter(isLinuxHost);
  const macs = state.peers.filter((p) => !isLinuxHost(p));

  return (
    <div className="mt-2">
      <p className="mb-6 text-[12px] leading-relaxed text-[var(--text-muted)]">
        Connect this Mac to another Mac, or to a Linux server, and work across both from one place.
        A connected machine's projects appear in your sidebar and open just like local ones.
      </p>
      <HostSection host={state.host} refresh={refresh} />
      <MacsSection macs={macs} peers={state.peers} host={state.host} refresh={refresh} />
      <LinuxHostsSection hosts={linuxHosts} refresh={refresh} />
      {state.peers.length > 0 && <SyncSection peers={state.peers} />}
    </div>
  );
}

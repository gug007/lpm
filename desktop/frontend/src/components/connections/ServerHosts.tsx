import { isLinuxHost } from "../../peer/platform";
import { usePeerState } from "../../peer/usePeerState";
import { LinuxHostsSection } from "./LinuxHostsSection";
import { SyncSection } from "./SyncSection";

// The Server screen's Linux hosts: each one already paired with its menu, how
// they keep up with this app and what they sync, as in Settings → Connections.
// Absent until there is one, since adding a host is the screen's first choice.
export function ServerHosts() {
  const { state, refresh } = usePeerState();
  const hosts = state.peers.filter(isLinuxHost);
  if (hosts.length === 0) return null;
  return (
    <>
      <LinuxHostsSection hosts={hosts} refresh={refresh} adding={false} />
      <SyncSection peers={hosts} />
    </>
  );
}

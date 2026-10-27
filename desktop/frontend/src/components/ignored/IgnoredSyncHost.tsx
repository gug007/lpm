import { useEffect } from "react";
import { usePeerState } from "../../peer/usePeerState";
import { IgnoredSyncDialog } from "./IgnoredSyncDialog";
import { useIgnoredSyncStore } from "./ignoredSyncStore";

// The window's one Sync Ignored Files dialog, opened from any of its menus, and
// the paired computers those menus pair projects with.
export function IgnoredSyncHost() {
  const request = useIgnoredSyncStore((s) => s.request);
  const close = useIgnoredSyncStore((s) => s.close);
  const { state } = usePeerState();

  useEffect(() => useIgnoredSyncStore.getState().setPeers(state.peers), [state.peers]);

  if (!request?.pairs.length) return null;
  return <IgnoredSyncDialog key={request.pairs[0].slug + (request.focus ?? "")} request={request} onClose={close} />;
}

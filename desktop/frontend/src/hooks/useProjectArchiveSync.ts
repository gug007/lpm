import { useEffect } from "react";
import { EventsOn } from "../../bridge/runtime";
import { watchConnectedPeers } from "../peer/route";
import { useProjectArchiveStore } from "../store/projectArchive";

// A burst of project changes (a start, its status, a refresh) lists once.
const SETTLE_MS = 800;

/** Keeps the archived projects of this machine and every connected paired one
 *  current, for the More menu's Archive row and the Archive page. */
export function useProjectArchiveSync(): void {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const reload = () => {
      clearTimeout(timer);
      timer = setTimeout(() => void useProjectArchiveStore.getState().load(), SETTLE_MS);
    };
    void useProjectArchiveStore.getState().load();
    const offChanged = EventsOn("projects-changed", reload);
    const offPeers = watchConnectedPeers((peers) => {
      useProjectArchiveStore.setState({ peers });
      reload();
    });
    return () => {
      clearTimeout(timer);
      offChanged();
      offPeers();
    };
  }, []);
}

import { useEffect } from "react";
import { EventsOn } from "../../bridge/runtime";
import { noteMacUpdateProgress, reconcileMacUpdates } from "../store/macUpdates";
import { noteLatestRelease } from "../store/releaseVersions";
import type { PeerClient } from "./usePeerState";

/** Keeps updates running on paired Macs current: each step the Mac reports, and
 *  what its connection says once lpm restarts there. Mount once. */
export function useMacUpdateWatch(peers: PeerClient[]) {
  useEffect(() => EventsOn("peer-update-progress", noteMacUpdateProgress), []);
  useEffect(() => EventsOn("update-available", noteLatestRelease), []);
  useEffect(() => reconcileMacUpdates(peers), [peers]);
}

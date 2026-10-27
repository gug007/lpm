import { create } from "zustand";
import type { PeerClient } from "../../peer/usePeerState";
import { useAppStore } from "../../store/app";
import type { SyncPair } from "./ignoredSyncApi";
import { syncPairsFor } from "./syncPairs";

export interface IgnoredSyncRequest {
  // Every other computer that holds the project.
  pairs: SyncPair[];
  // A path to open the tree at and tick, from the Files tab.
  focus?: string;
}

interface IgnoredSyncState {
  peers: PeerClient[];
  request: IgnoredSyncRequest | null;
  setPeers: (peers: PeerClient[]) => void;
  open: (request: IgnoredSyncRequest) => void;
  close: () => void;
}

// The paired computers as the main window last read them, so a menu anywhere
// can tell which of them hold the same project, and the one open dialog.
export const useIgnoredSyncStore = create<IgnoredSyncState>((set) => ({
  peers: [],
  request: null,
  setPeers: (peers) => set({ peers }),
  open: (request) => set({ request }),
  close: () => set({ request: null }),
}));

export function useSyncPairs(projectName: string): SyncPair[] {
  const projects = useAppStore((s) => s.projects);
  const peers = useIgnoredSyncStore((s) => s.peers);
  return syncPairsFor(projectName, projects, peers);
}

import { useCallback, useEffect, useState } from "react";
import { PeerState } from "../../bridge/commands";
import { EventsOn } from "../../bridge/runtime";

export interface PeerHostDevice {
  id: string;
  name: string;
}

export interface PeerHostPairing {
  code: string;
  port: number;
  hosts: string[];
  fp?: string;
}

export interface PeerPairRequest {
  id: string;
  name: string;
  sas: string;
}

export interface PeerHostState {
  enabled: boolean;
  port: number;
  hostId: string;
  pairing: PeerHostPairing | null;
  devices: PeerHostDevice[];
  pairRequests: PeerPairRequest[];
}

export interface PeerClient {
  slug: string;
  alias: string;
  host: string;
  port: number;
  hostId?: string;
  enabled: boolean;
  connected: boolean;
  supportsSync?: boolean;
  lastSyncAt?: number;
  lastError?: string;
}

export interface DiscoveredPeer {
  id: string;
  name: string;
  hosts: string[];
  port: number;
  dev: boolean;
}

export interface PeerStateShape {
  host: PeerHostState;
  peers: PeerClient[];
}

export const DEFAULT_PEER_STATE: PeerStateShape = {
  host: { enabled: false, port: 8766, hostId: "", pairing: null, devices: [], pairRequests: [] },
  peers: [],
};

// Live peer configuration + connection status for both roles. Refreshes on
// `peer-state-changed`, emitted whenever a connection or the config changes.
export function usePeerState(): { state: PeerStateShape; refresh: () => Promise<void> } {
  const [state, setState] = useState<PeerStateShape>(DEFAULT_PEER_STATE);

  const refresh = useCallback(async () => {
    try {
      const s = (await PeerState()) as PeerStateShape;
      setState({
        host: { ...DEFAULT_PEER_STATE.host, ...(s?.host ?? {}) },
        peers: s?.peers ?? [],
      });
    } catch {
      /* peer server may be starting; keep last known */
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => EventsOn("peer-state-changed", () => void refresh()), [refresh]);

  return { state, refresh };
}

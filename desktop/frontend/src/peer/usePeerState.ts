import { useCallback, useEffect, useState } from "react";
import { PeerState } from "../../bridge/commands";
import { EventsOn } from "../../bridge/runtime";

export interface PeerHostDevice {
  id: string;
  name: string;
  // "macos" / "linux". Empty for a device paired before platforms were reported.
  platform?: string;
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
  running: boolean;
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
  supportsSync2?: boolean;
  // The peer's build can hand its working state over ("Bring changes").
  supportsGitBring?: boolean;
  // ...and answer the cheap fingerprint a followed project polls for.
  supportsGitFollow?: boolean;
  pinned?: boolean;
  lastSyncAt?: number;
  lastError?: string;
  autoSync?: boolean;
  // Reachability over SSH, when this peer is behind a forward: `sshHost` is the
  // destination and `tunnel` is up/connecting/down. Reported apart from
  // `connected` because a dead forward and a dead host look identical and are
  // fixed differently.
  sshHost?: string;
  tunnel?: string;
  // The lpm the far end reports, re-read on every connect. A Linux host never
  // self-updates (the updater is macOS-only), so this is the only way to know it
  // has drifted behind this Mac.
  version?: string;
  // What the other end runs, re-reported on every connect. A "linux" peer is a
  // headless host rather than someone's Mac. Empty until its next connect for an
  // entry paired before hosts sent it — treat unknown as a Mac, never as Linux.
  platform?: string;
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
  host: {
    enabled: false,
    port: 8766,
    running: false,
    hostId: "",
    pairing: null,
    devices: [],
    pairRequests: [],
  },
  peers: [],
};

/// The display name a peer is known by, for copy that names the other Mac.
export function peerAlias(peers: PeerClient[], slug: string): string {
  const peer = peers.find((p) => p.slug === slug);
  return peer?.alias || peer?.host || "another Mac";
}

/// Every peer's display name, keyed by slug, for views that label many at once.
export function peerAliasMap(peers: PeerClient[]): Record<string, string> {
  return Object.fromEntries(peers.map((p) => [p.slug, p.alias || p.host || "another Mac"]));
}

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

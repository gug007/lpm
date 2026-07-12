import { create } from "zustand";
import { PeerList, PeerSend } from "../../bridge/commands";
import { EventsOn } from "../../bridge/runtime";

export interface RemotePeer {
  id: string;
  name: string;
  host: string;
  port: number;
  status: string;
}

export interface RemoteProject {
  name: string;
  label: string;
  running: boolean;
}

export interface RemoteTerminal {
  id: string;
  label: string;
  project: string;
  cols: number;
  rows: number;
}

// Which surface owns a remote terminal (renders live + drives size). A peer Mac
// owns via kind "mobile" with id = our device id (the peer record's `id`).
export interface RemoteOwner {
  kind: string;
  id: string;
  label: string;
}

export interface PeerFrame {
  t?: string;
  [k: string]: unknown;
}

export type FrameMaps = {
  projectsByPeer: Record<string, RemoteProject[]>;
  terminalsByPeer: Record<string, Record<string, RemoteTerminal[]>>;
  controlByPeer: Record<string, Record<string, RemoteOwner | null>>;
};

// True when `owner` is this controlling Mac — our device id on the controlled Mac
// equals the peer record's `id`. Ownership gates input + geometry, not the view.
export function isSelfOwner(owner: RemoteOwner | null | undefined, deviceId: string): boolean {
  return !!owner && owner.kind === "mobile" && owner.id === deviceId;
}

// Pure reduction of a server push frame into the structured maps. Streaming
// frames (o) are consumed imperatively by the terminal mirror, not stored here,
// so terminal bytes never sit in React state. `control` and `seed` carry the
// terminal's owner, which drives the mirror's view-vs-control state.
export function reducePeerFrame<T extends FrameMaps>(state: T, peerId: string, frame: PeerFrame): T {
  switch (frame?.t) {
    case "projects":
      return {
        ...state,
        projectsByPeer: {
          ...state.projectsByPeer,
          [peerId]: (frame.projects as RemoteProject[]) ?? [],
        },
      };
    case "terminals": {
      const project = (frame.project as string) ?? "";
      const forPeer = {
        ...(state.terminalsByPeer[peerId] ?? {}),
        [project]: (frame.terminals as RemoteTerminal[]) ?? [],
      };
      return {
        ...state,
        terminalsByPeer: { ...state.terminalsByPeer, [peerId]: forPeer },
      };
    }
    case "seed":
    case "control": {
      const id = (frame.id as string) ?? "";
      if (!id) return state;
      const forPeer = {
        ...(state.controlByPeer[peerId] ?? {}),
        [id]: (frame.owner as RemoteOwner | null) ?? null,
      };
      return {
        ...state,
        controlByPeer: { ...state.controlByPeer, [peerId]: forPeer },
      };
    }
    default:
      return state;
  }
}

export interface PeersState extends FrameMaps {
  peers: RemotePeer[];
  selection: { peerId: string; project: string } | null;
  init: () => void;
  refreshPeers: () => Promise<void>;
  selectRemoteProject: (peerId: string, project: string) => void;
  clearSelection: () => void;
  requestTerminals: (peerId: string, project: string) => void;
}

let initialized = false;

export const usePeersStore = create<PeersState>((set, get) => ({
  peers: [],
  projectsByPeer: {},
  terminalsByPeer: {},
  controlByPeer: {},
  selection: null,

  init: () => {
    if (initialized) return;
    initialized = true;
    void get().refreshPeers();

    EventsOn("peers-changed", () => {
      void get().refreshPeers();
    });

    EventsOn("peer-status", (p: { id: string; status: string }) => {
      set((s) => ({
        peers: s.peers.map((x) => (x.id === p.id ? { ...x, status: p.status } : x)),
      }));
      if (p.status === "connected") {
        void PeerSend(p.id, { t: "projects" });
        const sel = get().selection;
        if (sel && sel.peerId === p.id) void PeerSend(p.id, { t: "terminals", project: sel.project });
      }
    });

    EventsOn("peer-frame", (m: { peerId: string; frame: PeerFrame }) => {
      if (!m || !m.frame) return;
      // Structural frames update the store; the `o` stream is consumed by the
      // terminal mirror, so skip set() on the hot output path. `seed`/`control`
      // carry ownership (seed also carries data, read separately by the mirror).
      const t = m.frame.t;
      if (t === "projects" || t === "terminals" || t === "seed" || t === "control") {
        set((s) => reducePeerFrame(s, m.peerId, m.frame));
      } else if (t === "projects-changed") {
        void PeerSend(m.peerId, { t: "projects" });
        const sel = get().selection;
        if (sel && sel.peerId === m.peerId) void PeerSend(m.peerId, { t: "terminals", project: sel.project });
      }
    });
  },

  refreshPeers: async () => {
    try {
      const list = (await PeerList()) as RemotePeer[];
      set((s) => {
        const keep = s.selection && list.some((p) => p.id === s.selection!.peerId);
        return { peers: list, selection: keep ? s.selection : null };
      });
    } catch {
      /* hub may still be starting */
    }
  },

  selectRemoteProject: (peerId, project) => {
    set({ selection: { peerId, project } });
    void PeerSend(peerId, { t: "terminals", project });
  },

  clearSelection: () => set({ selection: null }),

  requestTerminals: (peerId, project) => {
    void PeerSend(peerId, { t: "terminals", project });
  },
}));

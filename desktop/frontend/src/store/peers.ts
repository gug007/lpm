import { create } from "zustand";
import { PeerList, PeerSend } from "../../bridge/commands";
import { EventsOn } from "../../bridge/runtime";
import type { ActionInfo } from "../types";
import { resolvePeerFrame } from "./peerRequest";

export interface RemotePeer {
  id: string;
  name: string;
  host: string;
  port: number;
  status: string;
}

export interface RemoteService {
  name: string;
  cmd?: string;
  port?: number[];
}

export interface RemoteProject {
  name: string;
  label: string;
  running: boolean;
  services?: RemoteService[];
  allServices?: RemoteService[];
  actions?: ActionInfo[];
  [k: string]: unknown;
}

export interface RemoteTerminal {
  id: string;
  label: string;
  project: string;
  cols: number;
  rows: number;
  cli?: string;
  emoji?: string;
  pinned?: boolean;
}

export interface RemoteStatusEntry {
  key: string;
  value: string;
  paneID?: string;
  priority?: number;
  timestamp?: number;
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
  statusByPeer: Record<string, Record<string, RemoteStatusEntry[]>>;
};

// True when `owner` is this controlling Mac — our device id on the controlled Mac
// equals the peer record's `id`. Ownership gates input + geometry, not the view.
export function isSelfOwner(owner: RemoteOwner | null | undefined, deviceId: string): boolean {
  return !!owner && owner.kind === "mobile" && owner.id === deviceId;
}

// Pure reduction of a server push frame into the structured maps. Streaming
// frames (o) are consumed imperatively by the terminal mirror, not stored here,
// so terminal bytes never sit in React state. `control`/`seed` carry the
// terminal's owner; `status` carries per-pane agent status.
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
    case "status": {
      const project = (frame.project as string) ?? "";
      const forPeer = {
        ...(state.statusByPeer[peerId] ?? {}),
        [project]: (frame.status as RemoteStatusEntry[]) ?? [],
      };
      return {
        ...state,
        statusByPeer: { ...state.statusByPeer, [peerId]: forPeer },
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

// Relay/command replies whose success should refresh the terminal list, and those
// that only need error surfacing (project/service state refreshes via the
// projects-changed push the server sends).
const TERMINAL_REPLIES = new Set([
  "runAction",
  "newTerminal",
  "closeTerminal",
  "renameTerminal",
  "pinTerminal",
  "reorderTerminals",
]);
const PROJECT_REPLIES = new Set(["start", "stop", "toggleService"]);

export interface PeersState extends FrameMaps {
  peers: RemotePeer[];
  selection: { peerId: string; project: string } | null;
  lastError: { seq: number; text: string } | null;
  init: () => void;
  refreshPeers: () => Promise<void>;
  selectRemoteProject: (peerId: string, project: string) => void;
  clearSelection: () => void;
  requestTerminals: (peerId: string, project: string) => void;
  requestStatus: (peerId: string, project: string) => void;
}

let initialized = false;
let noticeSeq = 0;

export const usePeersStore = create<PeersState>((set, get) => ({
  peers: [],
  projectsByPeer: {},
  terminalsByPeer: {},
  controlByPeer: {},
  statusByPeer: {},
  selection: null,
  lastError: null,

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
        if (sel && sel.peerId === p.id) {
          void PeerSend(p.id, { t: "terminals", project: sel.project });
          void PeerSend(p.id, { t: "status", project: sel.project });
        }
      }
    });

    EventsOn("peer-frame", (m: { peerId: string; frame: PeerFrame }) => {
      if (!m || !m.frame) return;
      const t = m.frame.t;

      // Resolve any pending request/reply (git review, ship ops) awaiting this frame.
      resolvePeerFrame(m.peerId, m.frame);

      // Structural frames update the store; the `o` stream is consumed by the
      // terminal mirror, so it never reaches here as a set().
      if (t === "projects" || t === "terminals" || t === "seed" || t === "control" || t === "status") {
        set((s) => reducePeerFrame(s, m.peerId, m.frame));
        return;
      }

      // Server pushes: refetch the affected data.
      if (t === "projects-changed") {
        void PeerSend(m.peerId, { t: "projects" });
        const sel = get().selection;
        if (sel && sel.peerId === m.peerId) void PeerSend(m.peerId, { t: "terminals", project: sel.project });
        return;
      }
      if (t === "status-changed") {
        void PeerSend(m.peerId, { t: "status", project: (m.frame.project as string) ?? "" });
        return;
      }

      // Command / relay replies.
      if (t && (TERMINAL_REPLIES.has(t) || PROJECT_REPLIES.has(t))) {
        if (m.frame.ok === false) {
          const text = (m.frame.error as string) || "That didn't work on the other Mac.";
          set({ lastError: { seq: ++noticeSeq, text } });
        } else if (TERMINAL_REPLIES.has(t)) {
          const sel = get().selection;
          if (sel && sel.peerId === m.peerId) void PeerSend(m.peerId, { t: "terminals", project: sel.project });
        }
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
    void PeerSend(peerId, { t: "status", project });
  },

  clearSelection: () => set({ selection: null }),

  requestTerminals: (peerId, project) => {
    void PeerSend(peerId, { t: "terminals", project });
  },

  requestStatus: (peerId, project) => {
    void PeerSend(peerId, { t: "status", project });
  },
}));

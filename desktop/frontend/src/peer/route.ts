// Runtime wiring that sits between the command/event bridges and the peer
// transport. The routing DECISIONS live in ./router (pure, unit-tested); this
// module performs the side effects: forwarding invokes over the peer WS,
// attaching to remote terminals, merging project lists, and demultiplexing the
// per-peer event stream. Imports only the Tauri API + the pure router, so it
// never forms a cycle with bridge/commands.js or bridge/runtime.js.
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { ProjectInfo } from "../types";
import { prefixName } from "./markers";
import {
  GLOBAL_PEER_EVENTS,
  START_TERMINAL_CMDS,
  findAgreedSlug,
  isLocalOnlyCommand,
  mergeProjectLists,
  stripArgs,
  translatePeerEventPayload,
  translateResult,
} from "./router";

export { GLOBAL_PEER_EVENTS };

interface PeerMeta {
  slug: string;
  connected: boolean;
}

let peers: PeerMeta[] = [];
// Last good translated project list per peer — served (as-is) when a live
// list_projects call fails so a transient hiccup doesn't blank the sidebar.
const peerListCache = new Map<string, ProjectInfo[]>();
let registryStarted = false;
// Notified AFTER `peers` is refreshed so tap reconciliation sees fresh state.
const peerChangeListeners = new Set<() => void>();

async function refreshPeers(): Promise<void> {
  try {
    const state = await invoke("peer_state");
    const list = ((state as { peers?: unknown[] } | null)?.peers ?? []) as {
      slug: string;
      connected: boolean;
    }[];
    peers = list.map((p) => ({ slug: p.slug, connected: !!p.connected }));
    const present = new Set(peers.map((p) => p.slug));
    for (const slug of [...peerListCache.keys()]) {
      if (!present.has(slug)) peerListCache.delete(slug);
    }
  } catch {
    /* peer server not ready yet; keep last known */
  }
}

// Reload the peer set, THEN fan out to subscribers. Ordering is load-bearing:
// a subscriber's reconcile reads the module-level `peers`, so it must run only
// after the fresh state is applied — otherwise a just-connected peer (whose
// state-changed event fires while `peers` still shows it disconnected) is never
// tapped and its forwarded events never arrive.
function reloadAndNotify(): void {
  void refreshPeers().then(() => {
    for (const cb of peerChangeListeners) cb();
  });
}

// Idempotent, browser-only. Safe to call from any entry point; a no-op under
// test/SSR where there is no Tauri runtime.
function ensureRegistry(): void {
  if (registryStarted || typeof window === "undefined") return;
  registryStarted = true;
  reloadAndNotify();
  listen("peer-state-changed", reloadAndNotify).catch(() => {});
}

function onPeersChanged(cb: () => void): () => void {
  ensureRegistry();
  peerChangeListeners.add(cb);
  return () => peerChangeListeners.delete(cb);
}

function connectedSlugs(): string[] {
  ensureRegistry();
  return peers.filter((p) => p.connected).map((p) => p.slug);
}

async function routedListProjects(): Promise<ProjectInfo[]> {
  const local = ((await invoke("list_projects")) as ProjectInfo[] | null) ?? [];
  const slugs = connectedSlugs();
  const peerLists = await Promise.all(
    slugs.map(async (slug) => {
      try {
        const raw = await invoke("peer_invoke", { slug, cmd: "list_projects", args: {} });
        const translated = translateResult("list_projects", slug, raw) as ProjectInfo[];
        peerListCache.set(slug, translated);
        return translated;
      } catch {
        return peerListCache.get(slug) ?? [];
      }
    }),
  );
  return mergeProjectLists(local, peerLists);
}

async function dispatchToPeer(
  cmd: string,
  slug: string,
  strippedArgs: Record<string, unknown>,
  originalArgs: unknown,
): Promise<unknown> {
  const value = await invoke("peer_invoke", { slug, cmd, args: strippedArgs });
  if (START_TERMINAL_CMDS.has(cmd)) {
    const prefixedId = prefixName(slug, String(value));
    // Subscribe so the seed + live output stream back before the pane mounts.
    invoke("peer_term_attach", { id: prefixedId }).catch(() => {});
    return prefixedId;
  }
  if (cmd === "stop_terminal") {
    const id = (originalArgs as { id?: unknown } | null)?.id;
    if (typeof id === "string") invoke("peer_term_detach", { id }).catch(() => {});
    return value;
  }
  return translateResult(cmd, slug, value);
}

// The single interception point for every command. bridge/commands.js routes
// all of its wrappers through here.
export function routedInvoke(cmd: string, args?: unknown): Promise<unknown> {
  ensureRegistry();
  if (cmd === "list_projects") return routedListProjects();
  if (isLocalOnlyCommand(cmd)) return invoke(cmd, args as Record<string, unknown> | undefined);
  let slug: string | null;
  try {
    slug = findAgreedSlug(args);
  } catch (err) {
    return Promise.reject(err);
  }
  if (!slug) return invoke(cmd, args as Record<string, unknown> | undefined);
  return dispatchToPeer(cmd, slug, stripArgs(args), args);
}

// Event demultiplexing for bridge/runtime.js. For a subscription to one of the
// forwarded global events, also tap every connected peer's `peer-evt-{slug}`
// wrapper stream, filter to this event, translate the payload, and invoke the
// same callback. Taps are reconciled as peers connect/disconnect.
export function subscribePeerGlobalEvent(
  name: string,
  callback: (payload: unknown) => void,
): () => void {
  ensureRegistry();
  if (typeof window === "undefined") return () => {};
  const taps = new Map<string, { fn: (() => void) | null }>();
  let disposed = false;

  const addTap = (slug: string) => {
    if (taps.has(slug)) return;
    const holder: { fn: (() => void) | null } = { fn: null };
    taps.set(slug, holder);
    listen(`peer-evt-${slug}`, (event) => {
      const d = event.payload as { name?: string; payload?: unknown } | null;
      if (!d || d.name !== name) return;
      callback(translatePeerEventPayload(name, slug, d.payload));
    })
      .then((un) => {
        if (disposed || !taps.has(slug)) un();
        else holder.fn = un;
      })
      .catch(() => {});
  };

  const reconcile = () => {
    const active = new Set(connectedSlugs());
    for (const slug of active) addTap(slug);
    for (const [slug, holder] of [...taps]) {
      if (!active.has(slug)) {
        holder.fn?.();
        taps.delete(slug);
      }
    }
  };
  reconcile();
  // Re-tap whenever the peer set changes; onPeersChanged fires only after the
  // fresh state is applied, so reconcile always sees up-to-date connectivity.
  const offPeers = onPeersChanged(reconcile);

  return () => {
    disposed = true;
    offPeers();
    for (const [, holder] of taps) holder.fn?.();
    taps.clear();
  };
}

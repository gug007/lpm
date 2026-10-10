import { create } from "zustand";
import { toast } from "sonner";
import { PeerCancelMacUpdate, PeerUpdateMac } from "../../bridge/commands";
import {
  reconnectOutcome,
  withProgress,
  type MacUpdate,
  type MacUpdatePeer,
} from "../peer/macUpdate";

// Updates this Mac is running on paired Macs, by slug. Shared so the sidebar
// header and the Connections row show the same one, whichever started it.
export const useMacUpdates = create<Record<string, MacUpdate>>(() => ({}));

/** How long "Updated to …" stays on the line. */
const DONE_FOR_MS = 4000;
/** How long a Mac that dropped mid-update has to come back before this Mac
 *  stops saying it is restarting. */
const GIVE_UP_MS = 3 * 60 * 1000;

const giveUps = new Map<string, ReturnType<typeof setTimeout>>();

function set(slug: string, update: MacUpdate | undefined) {
  useMacUpdates.setState((all) => {
    const next = { ...all };
    if (update) next[slug] = update;
    else delete next[slug];
    return next;
  }, true);
  if (update?.phase !== "reconnecting") {
    clearTimeout(giveUps.get(slug));
    giveUps.delete(slug);
  }
}

function patch(slug: string, change: (update: MacUpdate) => MacUpdate) {
  const update = useMacUpdates.getState()[slug];
  if (update) set(slug, change(update));
}

function startReconnecting(slug: string) {
  const update = useMacUpdates.getState()[slug];
  if (!update || update.phase === "done") return;
  if (update.phase !== "reconnecting") set(slug, { ...update, phase: "reconnecting" });
  if (giveUps.has(slug)) return;
  giveUps.set(
    slug,
    setTimeout(() => {
      giveUps.delete(slug);
      const update = useMacUpdates.getState()[slug];
      if (update?.phase !== "reconnecting") return;
      set(slug, undefined);
      toast.error(`${update.name} hasn't come back`, {
        description: update.installed
          ? `lpm was restarting there to finish updating to ${update.target}.`
          : "The connection dropped while it was updating.",
      });
    }, GIVE_UP_MS),
  );
}

/** Install the latest lpm on a paired Mac. It restarts lpm there without asking
 *  anyone, which is the point: the Mac is this person's own. */
export async function startMacUpdate(slug: string, name: string, from: string, target: string) {
  if (useMacUpdates.getState()[slug]) return;
  set(slug, {
    name,
    phase: "checking",
    progress: -1,
    from,
    target,
    installed: false,
    cancelling: false,
  });
  try {
    const outcome = await PeerUpdateMac(slug);
    if (outcome === "cancelled") set(slug, undefined);
    else startReconnecting(slug);
  } catch (err) {
    set(slug, undefined);
    toast.error(`Couldn't update ${name}`, { description: String(err) });
  }
}

export async function cancelMacUpdate(slug: string) {
  patch(slug, (u) => ({ ...u, cancelling: true }));
  const stopping = await PeerCancelMacUpdate(slug).catch(() => false);
  if (!stopping) patch(slug, (u) => ({ ...u, cancelling: false }));
}

export function noteMacUpdateProgress(step: { slug?: unknown; phase?: unknown; progress?: unknown }) {
  if (typeof step.slug === "string") patch(step.slug, (u) => withProgress(u, step));
}

/** Square every running update with what its Mac now reports: gone quiet,
 *  back on the new release, or back without it. */
export function reconcileMacUpdates(peers: Array<MacUpdatePeer & { slug: string }>) {
  const bySlug = new Map(peers.map((p) => [p.slug, p]));
  for (const [slug, update] of Object.entries(useMacUpdates.getState())) {
    const peer = bySlug.get(slug);
    if (!peer) {
      set(slug, undefined);
      continue;
    }
    if (!peer.connected && update.phase !== "reconnecting" && update.phase !== "done") {
      startReconnecting(slug);
      continue;
    }
    const outcome = reconnectOutcome(update, peer);
    if (outcome === "landed") {
      set(slug, { ...update, phase: "done" });
      toast.success(`${update.name} is on lpm ${peer.version}`);
      setTimeout(() => {
        if (useMacUpdates.getState()[slug]?.phase === "done") set(slug, undefined);
      }, DONE_FOR_MS);
    } else if (outcome === "lost") {
      set(slug, undefined);
      if (update.installed) toast.error(`${update.name} restarted without updating`);
    }
  }
}

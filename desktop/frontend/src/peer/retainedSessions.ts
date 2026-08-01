import { isPeerName, peerSlugOf } from "./markers";

// Terminal emulators that outlive a transient drop of their peer link.
//
// A peer terminal's stream resumes by offset: on reconnect the client re-subscribes
// with the offset it has already applied and the host replies with only the bytes
// missed since. That is sound only while the screen those bytes continue is still
// alive. A dropped peer, though, takes its projects out of the sidebar, which
// unmounts their views and would dispose every emulator underneath them — leaving
// the reconnect no choice but a full replay onto a freshly cleared screen, which is
// exactly what strands a full-screen TUI painting at the wrong coordinates.
//
// So a peer terminal's session is retained rather than disposed when its view
// unmounts, and torn down later if nothing claims it back:
//   - a remounting pane reclaims it (the reconnect case, and the point of all this);
//   - its peer is unpaired or deleted — it is never coming back;
//   - its peer is reachable again yet nothing reclaimed the session within
//     RECLAIM_WINDOW_MS — the project was removed on the host, not merely unreachable;
//   - MAX_RETAIN_MS pass regardless, so a peer that never returns can't pin emulators
//     (and their output listeners) for the life of the app.
//
// The reclaim clock runs only while the peer is connected, so a long outage is
// bounded by MAX_RETAIN_MS alone and a short one always gets a full reclaim window.
//
// Note this can't be narrowed to peer drops only: an ordinary switch to another
// project unmounts the view the same way, and at that moment a real drop hasn't
// been published yet — the peer snapshot arrives in a later effect — so there is
// nothing to tell the two apart. Every peer terminal is therefore retained, and
// navigating away from a reachable peer just costs one reclaim window (it also
// makes switching straight back free). MAX_RETAINED caps how many can pile up
// inside that window.

// Generous next to a reconnect + project list + session restore (which itself waits
// on the peer before adopting a terminal), and short enough that a project removed
// on the host doesn't keep its screen around.
export const RECLAIM_WINDOW_MS = 60_000;
export const MAX_RETAIN_MS = 5 * 60_000;
// Well above the terminals one dropped peer can have on screen, low enough that
// clicking through projects can't pile up emulators (each holds its scrollback
// and its output listener) faster than the reclaim window retires them.
export const MAX_RETAINED = 32;

export interface PeerConnectivity {
  slug: string;
  connected: boolean;
}

interface RetainedSession {
  slug: string;
  dispose: () => void;
  hard: ReturnType<typeof setTimeout>;
  reclaim: ReturnType<typeof setTimeout> | null;
}

const retained = new Map<string, RetainedSession>();

// slug -> connected, from live peer state. Empty until the app publishes the first
// snapshot, so retention never engages before connectivity is known — an unknown
// peer is treated as gone, which is the pre-existing dispose-on-unmount behavior.
const peers = new Map<string, boolean>();

function clearTimers(entry: RetainedSession): void {
  clearTimeout(entry.hard);
  if (entry.reclaim) clearTimeout(entry.reclaim);
  entry.reclaim = null;
}

function release(terminalId: string): void {
  const entry = retained.get(terminalId);
  if (!entry) return;
  clearTimers(entry);
  retained.delete(terminalId);
  entry.dispose();
}

function armReclaim(terminalId: string, entry: RetainedSession): void {
  if (entry.reclaim) return;
  entry.reclaim = setTimeout(() => release(terminalId), RECLAIM_WINDOW_MS);
}

// Over the cap, give up the oldest session whose peer is reachable first — its
// reclaim clock is running, which is what a plain navigation looks like — before
// touching one that is waiting out a drop, which is what retention is for.
function enforceCap(): void {
  while (retained.size > MAX_RETAINED) {
    const victim =
      [...retained].find(([, e]) => e.reclaim !== null)?.[0] ??
      retained.keys().next().value;
    if (victim === undefined) return;
    release(victim);
  }
}

function disarmReclaim(entry: RetainedSession): void {
  if (!entry.reclaim) return;
  clearTimeout(entry.reclaim);
  entry.reclaim = null;
}

// Latest peer connectivity, published from the one place that already subscribes to
// it. A peer that leaves the snapshot was unpaired or deleted, so anything retained
// for it is disposed now rather than waiting out its window.
export function publishPeerSnapshot(snapshot: readonly PeerConnectivity[]): void {
  peers.clear();
  for (const peer of snapshot) peers.set(peer.slug, peer.connected);
  for (const [terminalId, entry] of [...retained]) {
    const connected = peers.get(entry.slug);
    if (connected === undefined) release(terminalId);
    else if (connected) armReclaim(terminalId, entry);
    else disarmReclaim(entry);
  }
}

// Take ownership of a peer terminal's session instead of disposing it. Returns false
// for anything that isn't a terminal on a currently paired peer — the caller then
// disposes as usual, so a genuine close never leaks.
export function retainPeerSession(terminalId: string, dispose: () => void): boolean {
  if (retained.has(terminalId)) return true;
  if (!isPeerName(terminalId)) return false;
  const slug = peerSlugOf(terminalId);
  if (!slug || !peers.has(slug)) return false;
  const entry: RetainedSession = {
    slug,
    dispose,
    hard: setTimeout(() => release(terminalId), MAX_RETAIN_MS),
    reclaim: null,
  };
  retained.set(terminalId, entry);
  if (peers.get(slug)) armReclaim(terminalId, entry);
  enforceCap();
  return true;
}

// A pane has the session again: retention is over and its teardown timers are off.
// No-op for a session that was never retained.
export function reclaimPeerSession(terminalId: string): void {
  const entry = retained.get(terminalId);
  if (!entry) return;
  clearTimers(entry);
  retained.delete(terminalId);
}

export function isPeerSessionRetained(terminalId: string): boolean {
  return retained.has(terminalId);
}

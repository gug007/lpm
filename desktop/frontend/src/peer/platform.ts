import type { PeerClient } from "./usePeerState";

// A machine reports its platform when it pairs and again on every connect, so a
// peer stored before that shipped reads as unknown until it reconnects.
//
// Unknown counts as a Mac. This started as a Mac-to-Mac feature, so that is what
// an old entry almost certainly is — and filing someone's Mac under "Linux hosts"
// is the worse way to be wrong than the reverse.
export function isLinuxHost(peer: Pick<PeerClient, "platform">): boolean {
  return peer.platform === "linux";
}

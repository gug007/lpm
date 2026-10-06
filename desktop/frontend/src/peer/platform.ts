import type { PeerClient } from "./usePeerState";

type PeerRole = Pick<PeerClient, "platform" | "headless">;

// A machine reports its platform when it pairs and again on every connect, and
// newer builds also say whether anyone is at it. A peer stored before either
// shipped reads as unknown until it reconnects.
//
// Unknown platform counts as a Mac. This started as a Mac-to-Mac feature, so that
// is what an old entry almost certainly is — and filing someone's Mac under
// "Linux hosts" is the worse way to be wrong than the reverse. A Linux peer that
// doesn't say whether it is headless is a host: until lpm shipped as a Linux
// desktop app, every one of them was.
export function isLinuxHost(peer: PeerRole): boolean {
  return peer.platform === "linux" && peer.headless !== false;
}

// Whether lpm there is ours to update or remove over SSH. Never on a Linux or
// Windows desktop: its lpm came from a package, and the host installer would put
// a second app beside it. Every other SSH-reached peer keeps what it always had.
export function managesHostInstall(peer: PeerRole & Pick<PeerClient, "sshHost">): boolean {
  if (!peer.sshHost || peer.platform === "windows") return false;
  return peer.platform !== "linux" || peer.headless !== false;
}

export type PeerNoun = "Mac" | "server" | "computer";

// What copy calls the machine: a server for a headless host, a Mac for a Mac (or
// an entry too old to say), and a computer for a Linux or Windows desktop.
export function peerNoun(peer: PeerRole): PeerNoun {
  if (isLinuxHost(peer)) return "server";
  if (!peer.platform || peer.platform === "macos") return "Mac";
  return "computer";
}

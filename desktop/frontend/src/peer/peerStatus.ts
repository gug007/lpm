import type { PeerClient } from "./usePeerState";

export type StatusTone = "live" | "pending" | "error" | "off";

export interface PeerStatus {
  tone: StatusTone;
  text: string;
  // The original message behind a rewritten one, for the row's tooltip. Empty
  // when the text already is the whole story.
  detail: string;
}

const TONE_COLORS: Record<StatusTone, string> = {
  live: "var(--accent-green)",
  pending: "var(--accent-amber)",
  error: "var(--accent-red)",
  off: "var(--text-muted)",
};

export function toneColor(tone: StatusTone): string {
  return TONE_COLORS[tone];
}

// A failure reaches us as whatever the socket, TLS stack, or SSH said, and
// "Operation timed out (os error 60)" tells nobody which machine to go look at
// or what to do about it. Rewrite the ones we recognize into what the user can
// act on; anything else stays verbatim, because a wrong guess about an unknown
// failure is worse than the raw text.
export function humanizeError(raw: string): string {
  const s = raw.toLowerCase();
  if (!s.trim()) return "Not connected";
  if (s.includes("timed out") || s.includes("timeout") || s.includes("os error 60"))
    return "Not responding — it may be asleep or on another network";
  if (s.includes("connection refused") || s.includes("os error 61"))
    return "Refused the connection — lpm may not be running there";
  if (
    s.includes("no route to host") ||
    s.includes("network is unreachable") ||
    s.includes("os error 65") ||
    s.includes("os error 51")
  )
    return "Can't be reached from this network";
  if (
    s.includes("nodename nor servname") ||
    s.includes("name or service not known") ||
    s.includes("failed to lookup")
  )
    return "That address doesn't resolve";
  if (s.includes("certificate") || s.includes("fingerprint") || s.includes("handshake"))
    return "Its identity doesn't match what we paired with";
  if (s.includes("unauthorized") || s.includes("auth failed") || s.includes("401"))
    return "No longer authorized — pair again";
  if (s.includes("connection reset") || s.includes("os error 54")) return "The connection dropped";
  if (s.includes("permission denied") && s.includes("publickey"))
    return "SSH refused the key for this server";
  return raw;
}

// One vocabulary for every place a machine's state is shown. A peer behind an SSH
// forward has two ways to be unreachable, and calling both of them "offline"
// sends the user to look at the wrong machine — so only speak about the tunnel
// while it is actually the thing that's wrong.
export function peerStatus(peer: PeerClient): PeerStatus {
  if (!peer.enabled) return { tone: "off", text: "Off", detail: "" };
  if (peer.connected) return { tone: "live", text: "Connected", detail: "" };
  if (peer.sshHost) {
    if (peer.tunnel === "connecting")
      return { tone: "pending", text: `Connecting over SSH to ${peer.sshHost}…`, detail: "" };
    if (peer.tunnel !== "up")
      return peer.lastError
        ? { tone: "error", text: humanizeError(peer.lastError), detail: peer.lastError }
        : { tone: "error", text: `No SSH connection to ${peer.sshHost}`, detail: "" };
  }
  if (peer.lastError)
    return { tone: "error", text: humanizeError(peer.lastError), detail: peer.lastError };
  return { tone: "pending", text: "Connecting…", detail: "" };
}

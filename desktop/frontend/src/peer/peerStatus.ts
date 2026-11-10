import { MACHINE } from "../machineWords";
import type { PeerClient } from "./usePeerState";

export type StatusTone = "live" | "pending" | "error" | "off";

export interface PeerStatus {
  tone: StatusTone;
  text: string;
  // The original message behind a rewritten one, for the row's tooltip. Empty
  // when the text already is the whole story.
  detail: string;
  // Still connected but not answering, so a Reconnect is worth offering even
  // though nothing has failed yet.
  reconnect?: boolean;
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
  if (peer.connected) return connectedStatus(peer);
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

// "38 ms", "1.4 s": a ping's round trip.
export function rttText(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms)} ms`;
}

function connectedStatus(peer: PeerClient): PeerStatus {
  const link = peer.link;
  if (link?.health === "silent")
    return {
      tone: "pending",
      text: "Not responding",
      detail: "Still connected, but it hasn't answered for a few seconds. lpm reconnects after a minute of silence.",
      reconnect: true,
    };
  if (link?.health === "slow" && link.rttMs)
    return { tone: "pending", text: `Slow · ${rttText(link.rttMs)} round trip`, detail: "" };
  const base = peer.overTailscale ? "Connected over Tailscale" : "Connected";
  return { tone: "live", text: link?.rttMs ? `${base} · ${rttText(link.rttMs)}` : base, detail: "" };
}

// What to say about a paired machine that isn't answering, wherever its things
// are missing from. Turned off here, or no longer accepting this one, no retry
// fixes, so the copy says what will and offers no Reconnect.
export function peerDownCopy(
  alias: string,
  status: PeerStatus | null,
  server: boolean,
): { title: string; detail: string; reconnect: boolean } {
  const where = `+ above your projects → ${server ? "Server" : "Another computer"}`;
  if (status?.tone === "off") {
    return { title: `${alias} is turned off on ${MACHINE.thisMachine}`, detail: `Turn it on from ${where}.`, reconnect: false };
  }
  if (status?.tone === "error" && /unauthorized|auth failed|401/i.test(status.detail)) {
    return {
      title: `${alias} no longer accepts ${MACHINE.thisMachine}`,
      detail: `Its access was removed there. Pair again from ${where}.`,
      reconnect: false,
    };
  }
  const detail = status?.tone === "error" ? `${status.text}. Trying again…` : "Reconnecting…";
  return { title: `${alias} disconnected`, detail, reconnect: true };
}

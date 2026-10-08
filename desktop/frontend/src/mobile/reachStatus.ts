import type { RemoteTone } from "../remoteStatus";

export interface ReachInput {
  enabled: boolean;
  running: boolean;
  bindError: string | null;
  /** The Tailscale app's address on this machine, when the app runs here. */
  tailscaleHost: string | null;
  /** Whether that address goes into pairing codes. */
  tailscale: boolean;
  builtInRunning: boolean;
  /** A paired device has come in over Tailscale before. */
  deviceUsedTailscale: boolean;
}

/** Whether a phone off the local network can reach this machine. */
export function canReachAway(r: ReachInput): boolean {
  return (r.tailscale && !!r.tailscaleHost) || r.builtInRunning;
}

/** A Tailscale address (100.64.0.0/10 or a MagicDNS name): reachable from any
 *  network the phone is on, unlike a home network address. */
export function isTailscaleAddress(host: string): boolean {
  const h = host.trim().toLowerCase();
  if (h.endsWith(".ts.net") || h.endsWith(".ts.net.")) return true;
  const parts = h.split(".").map(Number);
  return parts.length === 4 && parts.every(Number.isInteger) && parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127;
}

/** The one sentence under "Remote control": can a phone get in, and from where. */
export function reachHeadline(r: ReachInput, thisMachine: string): { tone: RemoteTone; label: string } {
  if (!r.enabled) return { tone: "off", label: "Off · paired phones can't connect" };
  if (r.running) {
    if (!canReachAway(r)) return { tone: "starting", label: "On · works on this network only" };
    return r.deviceUsedTailscale
      ? { tone: "live", label: `On · your devices reach ${thisMachine} from anywhere` }
      : { tone: "live", label: "On · works anywhere once your phone is on Tailscale" };
  }
  if (r.bindError?.trim()) return { tone: "problem", label: "Can't start" };
  return { tone: "starting", label: "Starting…" };
}

export type KeepAwakeStatus = "unsupported" | "off" | "paused" | "failed" | "awake" | "battery";

/** What the keep-awake row says under its switch. */
export function keepAwakeText(status: KeepAwakeStatus, thisMachine: string): string {
  switch (status) {
    case "unsupported":
      return "Not available on this computer.";
    case "paused":
      return "Starts when remote control is on.";
    case "failed":
      return `Couldn't keep ${thisMachine} awake. Turn it off and on to try again.`;
    case "awake":
      return "Awake · plugged in, so phones can connect any time.";
    case "battery":
      return `On battery · ${thisMachine} can sleep until it's plugged in.`;
    default:
      return "While remote control is on and it's plugged in. Closing the lid can still put it to sleep.";
  }
}

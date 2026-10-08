import type { RemoteTone } from "./remoteStatus";

/** What the built-in Tailscale node reports, as `tailnet_state` returns it. */
export interface TailnetState {
  available: boolean;
  enabled: boolean;
  state: string;
  authUrl: string | null;
  ip: string | null;
  dnsName: string | null;
  account: string | null;
  tailnet: string | null;
  error: string | null;
  deviceName: string;
  /** The Tailscale app's address on this machine, when the app is running. */
  systemIp: string | null;
}

export const DEFAULT_TAILNET_STATE: TailnetState = {
  available: true,
  enabled: false,
  state: "off",
  authUrl: null,
  ip: null,
  dnsName: null,
  account: null,
  tailnet: null,
  error: null,
  deviceName: "",
  systemIp: null,
};

export const TAILSCALE_ADMIN_URL = "https://login.tailscale.com/admin/machines";

/** The one next step the card offers. */
export type TailnetStep = "setUp" | "signIn" | "approve" | "blocked" | "retry" | "none";

export interface TailnetView {
  tone: RemoteTone;
  label: string;
  step: TailnetStep;
}

/** Turns the node's state into the status line and the button under it. The
 *  card always answers "can my phone reach this machine through it yet", and
 *  if not, what the one thing to do is. */
export function tailnetView(s: TailnetState): TailnetView {
  if (!s.available) {
    return { tone: "off", label: s.error ?? "Not available on this machine", step: "none" };
  }
  if (!s.enabled) return { tone: "off", label: "Off", step: "setUp" };
  switch (s.state) {
    case "running":
      return {
        tone: "live",
        label: s.account ? `Connected as ${s.account}` : "Connected",
        step: "none",
      };
    case "needsLogin":
      return { tone: "starting", label: "Sign in to finish setting up", step: "signIn" };
    case "needsApproval":
      return { tone: "starting", label: "Waiting for approval", step: "approve" };
    case "stopped":
      return { tone: "problem", label: "Blocked by your tailnet's settings", step: "blocked" };
    case "error":
      return { tone: "problem", label: "Couldn't connect to Tailscale", step: "retry" };
    case "off":
      return s.error
        ? { tone: "problem", label: "Couldn't start", step: "retry" }
        : { tone: "starting", label: "Starting…", step: "none" };
    default:
      return { tone: "starting", label: "Connecting…", step: "none" };
  }
}

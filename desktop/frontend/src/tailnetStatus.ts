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

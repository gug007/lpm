import { MACHINE } from "../machineWords";
import type { StatusTone } from "./peerStatus";
import type { PeerHostState } from "./usePeerState";

type HostLine = Pick<PeerHostState, "enabled" | "running" | "guestsOnly" | "port">;

/** The one sentence under "Allow control": can another machine get in, and from where. */
export function hostHeadline(
  host: HostLine,
  // Tailscale runs here, built in or as the app, so a machine off this network can reach it.
  away: boolean,
  // A machine this one connects to already does so over Tailscale.
  usedTailscale: boolean,
  words = MACHINE,
): { tone: StatusTone; text: string } {
  if (!host.enabled && host.guestsOnly)
    return { tone: "off", text: `Off · only people you let into a shared tab can reach ${words.thisMachine}` };
  if (!host.enabled) return { tone: "off", text: `Off · turn on to let ${words.anotherMachine} connect` };
  if (!host.running)
    return { tone: "pending", text: `Waiting for port ${host.port} — another copy of lpm may be using it` };
  if (!away) return { tone: "live", text: "On · works on this network only" };
  return usedTailscale
    ? { tone: "live", text: `On · your ${words.plural} reach ${words.thisMachine} from anywhere` }
    : { tone: "live", text: `On · works anywhere once your other ${words.plural} are on Tailscale` };
}

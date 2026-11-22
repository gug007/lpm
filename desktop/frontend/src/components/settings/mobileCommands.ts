import {
  PeerRemotePair,
  RemoteRenameDevice,
  RemoteRevokeDevice,
  RemoteSetConfig,
  RemoteSetKeepAwake,
  RemoteSetOpenFromPhone,
  RemoteStartPairing,
  RemoteState,
  TailnetSetEnabled,
  TailnetSignIn,
  TailnetSignOut,
  TailnetState,
} from "../../../bridge/commands";
import type { MachineRun } from "./machineCommands";

// A machine's phone server: its paired devices and how phones reach it (remote.rs).
export interface MobileCommands {
  state: () => Promise<unknown>;
  setConfig: (enabled: boolean, port: number, tailscale: boolean) => Promise<unknown>;
  setKeepAwake: (enabled: boolean) => Promise<unknown>;
  // Starts lpm's login helper so a phone can open lpm here while it's closed.
  // Absent for a connected machine: its phones reach it through this one.
  setOpenFromPhone?: (enabled: boolean) => Promise<unknown>;
  renameDevice: (id: string, name: string) => Promise<unknown>;
  revokeDevice: (id: string) => Promise<unknown>;
  startPairing: () => Promise<unknown>;
}

// A machine's built-in Tailscale (tailnet_cmds.rs). A connected machine keeps
// switching it off and signing out to itself: it may be reached only over it,
// so those are absent there.
export interface TailnetCommands {
  state: () => Promise<unknown>;
  signIn: () => Promise<unknown>;
  setEnabled?: (on: boolean) => Promise<unknown>;
  signOut?: () => Promise<unknown>;
}

export const LOCAL_MOBILE: MobileCommands = {
  state: () => RemoteState(),
  setConfig: (enabled, port, tailscale) => RemoteSetConfig(enabled, port, tailscale),
  setKeepAwake: (enabled) => RemoteSetKeepAwake(enabled),
  setOpenFromPhone: (enabled) => RemoteSetOpenFromPhone(enabled),
  renameDevice: (id, name) => RemoteRenameDevice(id, name),
  revokeDevice: (id) => RemoteRevokeDevice(id),
  startPairing: () => RemoteStartPairing(),
};

export const LOCAL_TAILNET: TailnetCommands = {
  state: () => TailnetState(),
  signIn: () => TailnetSignIn(),
  setEnabled: (on) => TailnetSetEnabled(on),
  signOut: () => TailnetSignOut(),
};

export function peerMobile(slug: string, run: MachineRun): MobileCommands {
  return {
    state: () => run("remote_state"),
    setConfig: (enabled, port, tailscale) => run("remote_set_config", { enabled, port, tailscale }),
    setKeepAwake: (enabled) => run("remote_set_keep_awake", { enabled }),
    renameDevice: (id, name) => run("remote_rename_device", { id, name }),
    revokeDevice: (id) => run("remote_revoke_device", { id }),
    startPairing: () => PeerRemotePair(slug),
  };
}

export function peerTailnet(run: MachineRun): TailnetCommands {
  return {
    state: () => run("tailnet_state"),
    signIn: () => run("tailnet_sign_in"),
  };
}

import { useMemo } from "react";
import type { PeerClient } from "../../peer/usePeerState";
import { peerMachine } from "../../settingsMachine";
import { MobileSettingsPane } from "../MobileSettingsPane";
import { PeerSettingsNotice } from "../settings/PeerSettingsNotice";
import { SettingsTargetContext } from "../settings/settingsTarget";
import { usePeerSettings } from "../settings/usePeerSettings";

// A connected machine's phones, read and changed there, or why they can't be yet.
export function PeerPhonePane({ peer }: { peer: PeerClient }) {
  const machine = useMemo(() => peerMachine(peer), [peer]);
  const supported = Boolean(peer.supportsHostSettings);
  const state = usePeerSettings(machine, peer.connected && supported);

  if (peer.connected && state.status === "ready") {
    return (
      <SettingsTargetContext.Provider value={state.target}>
        <MobileSettingsPane />
      </SettingsTargetContext.Provider>
    );
  }
  return <PeerSettingsNotice name={machine.name} connected={peer.connected} supported={supported} state={state} />;
}

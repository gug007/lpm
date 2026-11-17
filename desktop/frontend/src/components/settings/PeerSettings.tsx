import { useMemo, type ReactNode } from "react";
import type { PeerClient } from "../../peer/usePeerState";
import { peerMachine } from "../../settingsMachine";
import type { View } from "../../store/app";
import { PeerSettingsNotice } from "./PeerSettingsNotice";
import { SettingsLayout } from "./SettingsLayout";
import { usePeerSettings } from "./usePeerSettings";

// A connected machine's settings, in the same view as this one's: only the
// pages and rows that mean something there, saved there as they change.
export function PeerSettings({
  peer,
  picker,
  subpage,
  onNavigate,
}: {
  peer: PeerClient;
  picker: ReactNode;
  subpage?: ReactNode;
  onNavigate: (view: View) => void;
}) {
  const machine = useMemo(() => peerMachine(peer), [peer]);
  const supported = Boolean(peer.supportsHostSettings);
  const state = usePeerSettings(machine, peer.connected && supported);
  const target = peer.connected && state.status === "ready" ? state.target : null;

  return (
    <SettingsLayout
      machine={machine}
      target={target}
      notice={
        <PeerSettingsNotice
          name={machine.name}
          connected={peer.connected}
          supported={supported}
          state={state}
        />
      }
      picker={picker}
      subpage={subpage}
      onNavigate={onNavigate}
    />
  );
}

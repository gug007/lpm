import { useMemo } from "react";
import { usePeerState } from "../peer/usePeerState";
import { peerMachine, type PeerMachine } from "../settingsMachine";
import type { SidebarAgentRow } from "../sidebarAgents";
import { useAppStore } from "../store/app";
import { revealSettingsRow } from "./settings/revealSettingsRow";
import { usePeerSettings } from "./settings/usePeerSettings";
import { SidebarAgentSettingsPanel, type AgentSettingsState } from "./SidebarAgentSettingsPanel";

interface SidebarAgentPeerSettingsProps {
  slug: string;
  agent: SidebarAgentRow;
  anchor: HTMLElement;
  trigger: HTMLElement | null;
  onClose: () => void;
}

/** The agent settings of the paired computer an agent runs on: that machine
 *  keeps the agent's row and archives it, so its settings are the ones that
 *  apply, read and changed there as Settings does for it. */
export function SidebarAgentPeerSettings({ slug, agent, anchor, trigger, onClose }: SidebarAgentPeerSettingsProps) {
  const { state: peers, loaded } = usePeerState();
  const peer = peers.peers.find((p) => p.slug === slug);
  const machine = useMemo<PeerMachine>(
    () => (peer ? peerMachine(peer) : { kind: "peer", slug, name: slug, attended: true, mac: true, version: "" }),
    [peer, slug],
  );
  const supported = Boolean(peer?.supportsHostSettings);
  const remote = usePeerSettings(machine, Boolean(peer?.connected && supported));
  const openMachineSettings = useAppStore((s) => s.openMachineSettings);
  const setSettingsTab = useAppStore((s) => s.setSettingsTab);

  const name = machine.name;
  const state: AgentSettingsState = !loaded
    ? { status: "waiting", note: "Reaching the paired computer…" }
    : !peer
      ? { status: "waiting", note: "This computer isn't paired anymore." }
      : !peer.connected
        ? { status: "waiting", note: `${name} is offline. Its settings can be changed once it's back.` }
        : !supported
          ? { status: "waiting", note: `${name} runs an older lpm. Update it to change these settings from here.` }
          : remote.status === "ready"
            ? { status: "ready", target: remote.target }
            : remote.status === "failed"
              ? { status: "waiting", note: `Couldn't read the settings on ${name}.`, retry: remote.retry }
              : { status: "waiting", note: `Reading the settings on ${name}…` };

  return (
    <SidebarAgentSettingsPanel
      agent={agent}
      anchor={anchor}
      trigger={trigger}
      machineName={name}
      state={state}
      onOpenAll={() => {
        openMachineSettings(slug);
        setSettingsTab("agents");
        revealSettingsRow("general.keepFinishedAgents");
      }}
      onClose={onClose}
    />
  );
}

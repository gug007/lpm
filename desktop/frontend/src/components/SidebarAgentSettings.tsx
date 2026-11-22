import { peerSlugOf } from "../peer/markers";
import type { SidebarAgentRow } from "../sidebarAgents";
import { useAppStore } from "../store/app";
import { revealSettingsRow } from "./settings/revealSettingsRow";
import { useLocalSettingsTarget } from "./settings/useLocalSettingsTarget";
import { SidebarAgentPeerSettings } from "./SidebarAgentPeerSettings";
import { SidebarAgentSettingsPanel } from "./SidebarAgentSettingsPanel";

export interface SidebarAgentSettingsProps {
  projectName: string;
  agent: SidebarAgentRow;
  /** The row the panel opens beside. */
  anchor: HTMLElement;
  /** The button that opened it, so pressing it again closes it. */
  trigger: HTMLElement | null;
  onClose: () => void;
}

/** An agent row's settings panel, for the machine the agent runs on. */
export function SidebarAgentSettings({ projectName, agent, anchor, trigger, onClose }: SidebarAgentSettingsProps) {
  const local = useLocalSettingsTarget();
  const openSettingsTab = useAppStore((s) => s.openSettingsTab);
  const slug = peerSlugOf(projectName);

  if (slug) {
    return <SidebarAgentPeerSettings slug={slug} agent={agent} anchor={anchor} trigger={trigger} onClose={onClose} />;
  }
  return (
    <SidebarAgentSettingsPanel
      agent={agent}
      anchor={anchor}
      trigger={trigger}
      state={{ status: "ready", target: local }}
      onOpenAll={() => {
        openSettingsTab("agents");
        revealSettingsRow("general.keepFinishedAgents");
      }}
      onClose={onClose}
    />
  );
}

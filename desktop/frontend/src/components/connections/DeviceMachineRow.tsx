import type { PeerHostDevice } from "../../peer/usePeerState";
import { MachineRowShell } from "./MachineRowShell";
import { DetailLine } from "./DetailLine";
import { AccessLine } from "./AccessLine";
import { AgentFilesHereLine } from "./AgentFilesHereLine";
import { SECONDARY_BUTTON } from "../mobile/styles";
import { MACHINE as M } from "../../machineWords";

// A computer that opens this one, which this one doesn't open (yet).
export function DeviceMachineRow({
  device,
  open,
  onToggle,
  hostEnabled,
  onRemoveAccess,
  onPasteInvite,
  refresh,
}: {
  device: PeerHostDevice;
  open: boolean;
  onToggle: () => void;
  hostEnabled: boolean;
  onRemoveAccess: (device: PeerHostDevice) => void;
  onPasteInvite: () => void;
  refresh: () => Promise<void>;
}) {
  const name = device.name || M.Noun;

  return (
    <MachineRowShell
      name={name}
      live={false}
      status={
        <p className="truncate text-[11px] text-[var(--text-muted)]">
          {hostEnabled
            ? `Can open ${M.thisMachine}'s projects from over there`
            : `Can open ${M.thisMachine} once Allow control is on`}
        </p>
      }
      open={open}
      onToggle={onToggle}
    >
      <DetailLine
        title="Open its projects here"
        subtitle={`Not set up. Create an invite on ${name}, then paste it here.`}
      >
        <button type="button" onClick={onPasteInvite} className={SECONDARY_BUTTON}>
          Paste its invite
        </button>
      </DetailLine>
      <AccessLine device={device} hostEnabled={hostEnabled} pairing={false} onRemoveAccess={onRemoveAccess} />
      <AgentFilesHereLine device={device} refresh={refresh} />
    </MachineRowShell>
  );
}

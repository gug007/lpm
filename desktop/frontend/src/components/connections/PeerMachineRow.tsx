import { PeerSetEnabled } from "../../../bridge/commands";
import type { PeerClient, PeerHostDevice } from "../../peer/usePeerState";
import type { SyncDiff } from "../../peer/usePeerSync";
import { usePeerRowActions } from "./usePeerRowActions";
import { MachineRowShell } from "./MachineRowShell";
import { DetailLine } from "./DetailLine";
import { KeepAwakeLine } from "./KeepAwakeLine";
import { AccessLine } from "./AccessLine";
import { PeerSyncLines } from "./PeerSyncLines";
import { Toggle } from "./Toggle";

// A computer this one opens, and — when it opens this one too — that direction
// in the same row.
export function PeerMachineRow({
  peer,
  device,
  open,
  onToggle,
  hostEnabled,
  pairing,
  refresh,
  syncDiff,
  syncBusy,
  onSyncNow,
  onDisconnect,
  onRemoveAccess,
  onAllow,
}: {
  peer: PeerClient;
  device: PeerHostDevice | null;
  open: boolean;
  onToggle: () => void;
  hostEnabled: boolean;
  pairing: boolean;
  refresh: () => Promise<void>;
  syncDiff: SyncDiff | undefined;
  syncBusy: string | null;
  onSyncNow: () => void;
  onDisconnect: (peer: PeerClient) => void;
  onRemoveAccess: (device: PeerHostDevice) => void;
  onAllow: () => void;
}) {
  const { name, live, status, quickAction, menu, dialogs } = usePeerRowActions({
    peer,
    onRemove: onDisconnect,
    refresh,
  });

  return (
    <>
      <MachineRowShell
        name={name}
        badge={device ? "Both ways" : undefined}
        live={live}
        status={status}
        action={quickAction}
        open={open}
        onToggle={onToggle}
      >
        <DetailLine
          title="Open its projects here"
          subtitle={
            !peer.enabled
              ? "Off — turn on to show its projects here"
              : live
                ? "Its projects show in your sidebar"
                : "Its projects show here once it's reachable"
          }
        >
          <Toggle
            enabled={peer.enabled}
            ariaLabel={`Open ${name}'s projects here`}
            onChange={(v) => void PeerSetEnabled(peer.slug, v).then(refresh)}
          />
        </DetailLine>
        {peer.enabled && live && <KeepAwakeLine slug={peer.slug} name={name} />}
        <AccessLine
          device={device}
          hostEnabled={hostEnabled}
          pairing={pairing}
          onRemoveAccess={onRemoveAccess}
          onAllow={onAllow}
        />
        <PeerSyncLines peer={peer} diff={syncDiff} busy={syncBusy} onSyncNow={onSyncNow} />
        <div className="flex flex-wrap gap-x-4 gap-y-1 py-2.5">
          {menu.map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={item.onClick}
              disabled={item.disabled}
              className={`text-[12px] font-medium underline-offset-2 hover:underline disabled:opacity-50 ${
                item.destructive
                  ? "text-[var(--accent-red-text)]"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </MachineRowShell>
      {dialogs}
    </>
  );
}

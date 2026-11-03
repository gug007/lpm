import { useCallback, useState } from "react";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import {
  PeerHostCancelPairing,
  PeerHostRevokeDevice,
  PeerHostStartPairing,
  PeerRemove,
} from "../../../bridge/commands";
import type { PeerClient, PeerHostDevice, PeerHostState } from "../../peer/usePeerState";
import { usePeerConnect } from "../../peer/usePeerConnect";
import { usePeerSync } from "../../peer/usePeerSync";
import { machineEntries } from "../../peer/machineEntries";
import { connectsOnlyToMacs, peerNoun } from "../../peer/platform";
import { rowProps } from "../../settings-registry";
import { Group, GroupHeader } from "./GroupedList";
import { PeerMachineRow } from "./PeerMachineRow";
import { DeviceMachineRow } from "./DeviceMachineRow";
import { PairingInviteRow } from "./PairingInviteRow";
import { ClipboardInviteRow } from "./ClipboardInviteRow";
import { NearbyMacRow } from "./NearbyMacRow";
import { AddRow } from "./AddRow";
import { AddMachineModal } from "./AddMachineModal";
import { SyncPreviewModal } from "./SyncPreviewModal";
import { isMac } from "../../platform";
import { MACHINE as M } from "../../machineWords";

// Every computer in one list, one row each whichever way they connect: the ones
// this one opens, the ones that open this one, and the ones that do both. New
// ones join at the end — found nearby, from the clipboard, or from Add a Mac.
export function MachinesSection({
  macs,
  peers,
  host,
  refresh,
  cancelPairingOnLeave = false,
}: {
  macs: PeerClient[];
  peers: PeerClient[];
  host: PeerHostState;
  refresh: () => Promise<void>;
  cancelPairingOnLeave?: boolean;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [disconnecting, setDisconnecting] = useState<PeerClient | null>(null);
  const [revoking, setRevoking] = useState<PeerHostDevice | null>(null);
  const [pairingBusy, setPairingBusy] = useState(false);
  const connect = usePeerConnect({ peers, host, refresh, cancelOnUnmount: cancelPairingOnLeave });
  const sync = usePeerSync(macs);
  const entries = machineEntries(macs, host.devices);
  const pairing = !!host.pairing;

  // A computer that pairs closes Add a Mac; one that fails leaves it open with
  // what was typed.
  const closeOnPair = useCallback(async (attempt: Promise<string | null>) => {
    const paired = (await attempt) !== null;
    if (paired) setAddOpen(false);
    return paired;
  }, []);

  const startPairing = useCallback(async () => {
    setPairingBusy(true);
    try {
      await PeerHostStartPairing();
      await refresh();
    } finally {
      setPairingBusy(false);
    }
  }, [refresh]);

  // Closing the pane never cancels a live invite; only this does.
  const cancelPairing = useCallback(async () => {
    try {
      await PeerHostCancelPairing();
    } finally {
      await refresh();
    }
  }, [refresh]);

  const toggle = (key: string) => setOpen((cur) => (cur === key ? null : key));
  const pasteInvite = () => {
    setOpen(null);
    setAddOpen(true);
  };
  const disconnectKeepsAccess =
    !!disconnecting && entries.some((e) => e.peer?.slug === disconnecting.slug && e.device);

  return (
    <section className="mt-8" data-settings-row={rowProps("connections.sync").id}>
      <GroupHeader>{connectsOnlyToMacs(macs, isMac) ? "Your Macs" : "Your computers"}</GroupHeader>
      <Group>
        {entries.map(({ key, peer, device }) =>
          peer ? (
            <PeerMachineRow
              key={key}
              peer={peer}
              device={device}
              open={open === key}
              onToggle={() => toggle(key)}
              hostEnabled={host.enabled}
              pairing={pairing}
              refresh={refresh}
              syncDiff={sync.diffs[peer.slug]}
              syncBusy={sync.busy}
              onSyncNow={() => void sync.syncNow(peer)}
              onDisconnect={setDisconnecting}
              onRemoveAccess={setRevoking}
              onAllow={() => void startPairing()}
            />
          ) : (
            device && (
              <DeviceMachineRow
                key={key}
                device={device}
                open={open === key}
                onToggle={() => toggle(key)}
                hostEnabled={host.enabled}
                onRemoveAccess={setRevoking}
                onPasteInvite={pasteInvite}
                refresh={refresh}
              />
            )
          ),
        )}

        {host.pairing && <PairingInviteRow pairing={host.pairing} onCancel={() => void cancelPairing()} />}

        {connect.clipboard && (
          <ClipboardInviteRow
            invite={connect.clipboard.invite}
            busy={connect.adding}
            onConnect={() => void closeOnPair(connect.connectClipboard())}
            onDismiss={connect.dismissClipboard}
          />
        )}

        {connect.nearby.map((m) => (
          <NearbyMacRow
            key={m.id}
            mac={m}
            waiting={connect.request?.id === m.id}
            sas={connect.request?.id === m.id ? connect.request.sas : ""}
            disabled={connect.request !== null}
            onConnect={() => void connect.connectNearby(m)}
            onCancel={connect.cancelRequest}
          />
        ))}

        {entries.length === 0 && !host.pairing && (
          <p className="px-4 py-5 text-center text-[12px] text-[var(--text-muted)]">
            Nothing connected yet. Add a {isMac ? "Mac" : "computer"} to open its projects here, or to let it open{" "}
            {M.thisMachine}.
          </p>
        )}

        <AddRow
          title={isMac ? "Add a Mac" : "Add a computer"}
          description="Paste the invite it created, or create one for it."
          onClick={() => setAddOpen(true)}
        />
      </Group>

      {connect.error && <p className="mt-2 px-1 text-[11px] text-[var(--accent-red)]">{connect.error}</p>}

      <AddMachineModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        connect={connect}
        onPaired={closeOnPair}
        pairing={host.pairing}
        pairingBusy={pairingBusy}
        onCreateInvite={() => void startPairing()}
        onCancelInvite={() => void cancelPairing()}
      />
      <ConfirmDialog
        open={disconnecting !== null}
        title={`Disconnect ${disconnecting ? peerNoun(disconnecting) : "Mac"}`}
        variant="destructive"
        confirmLabel="Disconnect"
        body={
          <>
            Disconnect from{" "}
            <span className="font-medium text-[var(--text-primary)]">
              {disconnecting?.alias || disconnecting?.host}
            </span>
            ? Its projects will no longer appear here, and {M.thisMachine} is removed there too.
            {disconnectKeepsAccess && ` It can still open ${M.thisMachine} until you remove its access.`}
          </>
        }
        onCancel={() => setDisconnecting(null)}
        onConfirm={() => {
          if (disconnecting) void PeerRemove(disconnecting.slug).then(refresh);
          setDisconnecting(null);
        }}
      />
      <ConfirmDialog
        open={revoking !== null}
        title={`Remove access for ${revoking?.name || M.Noun}`}
        variant="destructive"
        confirmLabel="Remove access"
        body={
          <>
            Stop letting{" "}
            <span className="font-medium text-[var(--text-primary)]">{revoking?.name || M.Noun}</span>{" "}
            open {M.thisMachine}? {M.ThisMachine} is removed there too, and it will need a new invite to
            open {M.thisMachine} again.
          </>
        }
        onCancel={() => setRevoking(null)}
        onConfirm={() => {
          if (revoking) void PeerHostRevokeDevice(revoking.id).finally(refresh);
          setRevoking(null);
        }}
      />
      <SyncPreviewModal
        open={sync.preview !== null}
        slug={sync.preview?.slug ?? ""}
        peerName={sync.preview?.name ?? ""}
        items={sync.preview?.items ?? []}
        onClose={sync.closePreview}
        onSynced={() => void sync.refreshAll()}
      />
    </section>
  );
}

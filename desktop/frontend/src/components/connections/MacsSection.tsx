import { useCallback, useEffect, useRef, useState } from "react";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import {
  PeerAdd,
  PeerRemove,
  PeerPairRequest,
  PeerPairCancel,
  PeerDiscoveryStart,
  PeerDiscoveryStop,
  ReadClipboardText,
} from "../../../bridge/commands";
import { EventsOn } from "../../../bridge/runtime";
import type { PeerClient, PeerHostState, DiscoveredPeer } from "../../peer/usePeerState";
import { decodeInvite, type PeerInvite } from "../../peer/invite";
import { Group, GroupHeader } from "./GroupedList";
import { PeerRow } from "./PeerRow";
import { AddRow } from "./AddRow";
import { AddMacPanel } from "./AddMacPanel";
import { ClipboardInviteRow } from "./ClipboardInviteRow";
import { NearbyMacRow } from "./NearbyMacRow";

// The Mac we're currently asking to pair with, plus the code to compare once the
// other Mac responds.
interface PendingRequest {
  id: string;
  name: string;
  sas: string;
}

export function MacsSection({
  macs,
  peers,
  host,
  refresh,
}: {
  macs: PeerClient[];
  peers: PeerClient[];
  host: PeerHostState;
  refresh: () => Promise<void>;
}) {
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [removePeer, setRemovePeer] = useState<PeerClient | null>(null);
  const [discovered, setDiscovered] = useState<DiscoveredPeer[]>([]);
  const [request, setRequest] = useState<PendingRequest | null>(null);
  const [clipboard, setClipboard] = useState<{ raw: string; invite: PeerInvite } | null>(null);
  const dismissedRef = useRef<string | null>(null);

  const add = useCallback(
    async (hosts: string[], p: number, c: string, fp?: string) => {
      setAdding(true);
      setError(null);
      try {
        // Empty alias → the host auto-names the peer after the remote Mac.
        await PeerAdd(hosts, p, c, "", fp);
        await refresh();
        setAddOpen(false);
        return true;
      } catch (err) {
        setError(String(err));
        return false;
      } finally {
        setAdding(false);
      }
    },
    [refresh],
  );

  const connectFromInvite = useCallback(
    (raw: string) => {
      const invite = decodeInvite(raw);
      if (!invite) {
        setError("That isn't a complete invite.");
        return;
      }
      void add(invite.hosts, invite.port, invite.code, invite.fp);
    },
    [add],
  );

  // --- LAN discovery --------------------------------------------------------
  useEffect(() => {
    void PeerDiscoveryStart();
    const off = EventsOn("peer-discovery", (list: DiscoveredPeer[]) => {
      setDiscovered(Array.isArray(list) ? list : []);
    });
    return () => {
      if (typeof off === "function") off();
      void PeerDiscoveryStop();
    };
  }, []);

  // Pairing-request progress: the SAS to compare arrives here; failure surfaces
  // inline. Success flows through peer-state-changed (the paired Mac appears in
  // the list and its discovery row hides), which also clears the waiting row.
  useEffect(() => {
    const offPending = EventsOn("peer-pair-pending", (p: { sas: string }) => {
      setRequest((cur) => (cur ? { ...cur, sas: p?.sas ?? "" } : cur));
    });
    const offFailed = EventsOn("peer-pair-failed", (p: { error: string }) => {
      setError(p?.error || "Pairing failed.");
      setRequest(null);
    });
    return () => {
      if (typeof offPending === "function") offPending();
      if (typeof offFailed === "function") offFailed();
    };
  }, []);

  const pairedHostIds = new Set(peers.map((p) => p.hostId).filter(Boolean));
  const nearby = discovered.filter((m) => !pairedHostIds.has(m.id));

  // Drop the waiting row once its Mac becomes a peer.
  useEffect(() => {
    if (request && pairedHostIds.has(request.id)) setRequest(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [peers]);

  const connectNearby = useCallback(
    async (m: DiscoveredPeer) => {
      setError(null);
      setRequest({ id: m.id, name: m.name, sas: "" });
      try {
        await PeerPairRequest(m.hosts, m.port);
        setRequest(null);
        await refresh();
      } catch {
        // peer-pair-failed already surfaced the message and cleared the row.
      }
    },
    [refresh],
  );

  const cancelRequest = useCallback(() => {
    void PeerPairCancel();
    setRequest(null);
  }, []);

  // --- clipboard invite auto-detect -----------------------------------------
  const checkClipboard = useCallback(async () => {
    try {
      const raw = ((await ReadClipboardText()) as string) ?? "";
      const trimmed = raw.trim();
      const invite = decodeInvite(trimmed);
      if (!invite) return void setClipboard(null);
      if (trimmed === dismissedRef.current) return void setClipboard(null);
      // Our own invite, just copied to the clipboard.
      if (host.pairing && invite.code === host.pairing.code) return void setClipboard(null);
      // Already connected to this Mac.
      const dup = peers.some((p) => invite.hosts.includes(p.host) && p.port === invite.port);
      if (dup) return void setClipboard(null);
      setClipboard({ raw: trimmed, invite });
    } catch {
      /* clipboard unavailable — leave any prior offer as-is */
    }
  }, [host.pairing, peers]);

  useEffect(() => {
    void checkClipboard();
    const onFocus = () => void checkClipboard();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [checkClipboard]);

  // With nothing connected there is no list to keep tidy, and the field is the
  // whole point of the section — so it starts open and only folds away once
  // this Mac has somewhere to connect to.
  const panelOpen = addOpen || macs.length === 0;

  return (
    <section className="mt-8">
      <GroupHeader>Macs you connect to</GroupHeader>
      <Group>
        {macs.map((p) => (
          <PeerRow key={p.slug} peer={p} onRemove={setRemovePeer} refresh={refresh} />
        ))}

        {clipboard && (
          <ClipboardInviteRow
            invite={clipboard.invite}
            busy={adding}
            onConnect={() => {
              const raw = clipboard.raw;
              setClipboard(null);
              connectFromInvite(raw);
            }}
            onDismiss={() => {
              dismissedRef.current = clipboard.raw;
              setClipboard(null);
            }}
          />
        )}

        {nearby.map((m) => (
          <NearbyMacRow
            key={m.id}
            mac={m}
            waiting={request?.id === m.id}
            sas={request?.id === m.id ? request.sas : ""}
            disabled={request !== null}
            onConnect={() => void connectNearby(m)}
            onCancel={cancelRequest}
          />
        ))}

        {macs.length > 0 && (
          <AddRow
            title="Connect another Mac"
            description="Paste the invite it created, or enter its details."
            expanded={addOpen}
            onClick={() => setAddOpen((v) => !v)}
          />
        )}
        {panelOpen && (
          <AddMacPanel
            busy={adding}
            onInvite={connectFromInvite}
            onManual={(address, port, code) => add([address], port, code)}
          />
        )}
      </Group>

      {error && <p className="mt-2 px-1 text-[11px] text-[var(--accent-red)]">{error}</p>}

      <ConfirmDialog
        open={removePeer !== null}
        title="Disconnect Mac"
        variant="destructive"
        confirmLabel="Disconnect"
        body={
          <>
            Disconnect from{" "}
            <span className="font-medium text-[var(--text-primary)]">
              {removePeer?.alias || removePeer?.host}
            </span>
            ? Its projects will no longer appear here.
          </>
        }
        onCancel={() => setRemovePeer(null)}
        onConfirm={() => {
          if (removePeer) void PeerRemove(removePeer.slug).then(refresh);
          setRemovePeer(null);
        }}
      />
    </section>
  );
}

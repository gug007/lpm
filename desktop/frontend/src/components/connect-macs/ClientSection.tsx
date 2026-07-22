import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronRight } from "lucide-react";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import {
  PeerAdd,
  PeerRemove,
  PeerSetEnabled,
  PeerPairRequest,
  PeerPairCancel,
  PeerDiscoveryStart,
  PeerDiscoveryStop,
  ReadClipboardText,
} from "../../../bridge/commands";
import { EventsOn } from "../../../bridge/runtime";
import type { PeerClient, PeerHostState, DiscoveredPeer } from "../../peer/usePeerState";
import { decodeInvite, type PeerInvite } from "../../peer/invite";
import { Toggle } from "./Toggle";
import { PasteInviteField } from "./PasteInviteField";
import { Group, GroupHeader, Row } from "./GroupedList";
import { LaptopIcon } from "./LaptopIcon";

const FIELD_CLASS =
  "rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-1.5 text-[13px] text-[var(--text-primary)] outline-none focus:border-[var(--accent-cyan)]";

// The Mac we're currently asking to pair with, plus the code to compare once the
// other Mac responds.
interface PendingRequest {
  id: string;
  name: string;
  sas: string;
}

export function ClientSection({
  peers,
  host,
  refresh,
}: {
  peers: PeerClient[];
  host: PeerHostState;
  refresh: () => Promise<void>;
}) {
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [removePeer, setRemovePeer] = useState<PeerClient | null>(null);
  const [address, setAddress] = useState("");
  const [port, setPort] = useState("8766");
  const [code, setCode] = useState("");

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

  const canSubmitManual = address.trim().length > 0 && code.trim().length > 0 && !adding;
  const submitManual = async () => {
    if (!canSubmitManual) return;
    const ok = await add([address.trim()], Number(port) || 8766, code.trim());
    if (ok) {
      setAddress("");
      setCode("");
      setPort("8766");
    }
  };

  return (
    <section className="mt-8">
      <GroupHeader>Connect to another Mac</GroupHeader>
      <Group>
        {clipboard && (
          <div
            className="flex items-center gap-3 px-4 py-3"
            style={{
              backgroundColor: "color-mix(in srgb, var(--accent-green) 6%, transparent)",
            }}
          >
            <div
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
              style={{
                backgroundColor: "color-mix(in srgb, var(--accent-green) 15%, transparent)",
                color: "var(--accent-green)",
              }}
            >
              <LaptopIcon size={16} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-[var(--text-primary)]">
                Invite found in your clipboard
              </p>
              <p className="truncate text-[11px] text-[var(--text-muted)]">
                Connect to {clipboard.invite.hosts[0]}:{clipboard.invite.port}?
              </p>
            </div>
            <button
              onClick={() => {
                const raw = clipboard.raw;
                setClipboard(null);
                connectFromInvite(raw);
              }}
              disabled={adding}
              className="shrink-0 rounded-lg px-3 py-1.5 text-[13px] font-medium text-white transition-colors hover:opacity-90 disabled:opacity-60"
              style={{ backgroundColor: "var(--accent-green)" }}
            >
              {adding ? "Connecting…" : "Connect"}
            </button>
            <button
              onClick={() => {
                dismissedRef.current = clipboard.raw;
                setClipboard(null);
              }}
              className="shrink-0 rounded-md px-2.5 py-1 text-xs text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)]"
            >
              Dismiss
            </button>
          </div>
        )}

        {nearby.map((m) => {
          const waiting = request?.id === m.id;
          return (
            <Row key={m.id}>
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--bg-active)] text-[var(--text-muted)]">
                <LaptopIcon size={16} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-[var(--text-primary)]">{m.name}</p>
                {waiting ? (
                  <p className="truncate text-[11px] text-[var(--text-muted)]">
                    Waiting for approval on {m.name}
                    {request?.sas ? (
                      <>
                        {" · "}
                        <span className="font-mono tracking-widest text-[var(--text-secondary)]">
                          {request.sas}
                        </span>
                      </>
                    ) : null}
                  </p>
                ) : (
                  <p className="text-[11px] text-[var(--text-muted)]">Nearby</p>
                )}
              </div>
              {waiting ? (
                <button
                  onClick={cancelRequest}
                  className="shrink-0 rounded-md px-2.5 py-1 text-xs text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--accent-red)]"
                >
                  Cancel
                </button>
              ) : (
                <button
                  onClick={() => void connectNearby(m)}
                  disabled={request !== null}
                  className="flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors disabled:opacity-40"
                  style={{
                    backgroundColor: "color-mix(in srgb, var(--accent-cyan) 12%, transparent)",
                    color: "var(--accent-cyan)",
                  }}
                >
                  Connect
                </button>
              )}
            </Row>
          );
        })}

        <div className="px-4 py-3">
          <PasteInviteField busy={adding} onConnect={connectFromInvite} />
        </div>

        <button
          type="button"
          onClick={() => setManualOpen((v) => !v)}
          aria-expanded={manualOpen}
          className="flex w-full items-center px-4 py-3 text-left text-[13px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)]"
        >
          <span className="flex-1">Enter details manually</span>
          <ChevronRight
            size={14}
            className={`text-[var(--text-muted)] transition-transform ${manualOpen ? "rotate-90" : ""}`}
          />
        </button>

        {manualOpen && (
          <Row>
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Address"
              className={`${FIELD_CLASS} min-w-0 flex-1`}
            />
            <input
              value={port}
              onChange={(e) => setPort(e.target.value)}
              placeholder="Port"
              inputMode="numeric"
              className={`${FIELD_CLASS} w-20 shrink-0 tabular-nums`}
            />
          </Row>
        )}
        {manualOpen && (
          <Row>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && canSubmitManual) {
                  e.preventDefault();
                  void submitManual();
                }
              }}
              placeholder="Pairing code"
              className={`${FIELD_CLASS} min-w-0 flex-1 font-mono tracking-widest`}
            />
            <button
              onClick={submitManual}
              disabled={!canSubmitManual}
              className={`shrink-0 rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors ${
                canSubmitManual
                  ? "bg-[var(--accent-cyan)] text-white hover:opacity-90"
                  : "bg-[var(--bg-active)] text-[var(--text-muted)]"
              }`}
            >
              Connect
            </button>
          </Row>
        )}

        {peers.length === 0 ? (
          <p className="px-4 py-5 text-center text-[12px] text-[var(--text-muted)]">
            Not connected to any Mac yet.
          </p>
        ) : (
          peers.map((p) => {
            const live = p.enabled && p.connected;
            return (
              <Row key={p.slug}>
                <div
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors"
                  style={{
                    backgroundColor: live
                      ? "color-mix(in srgb, var(--accent-green) 15%, transparent)"
                      : "var(--bg-active)",
                    color: live ? "var(--accent-green)" : "var(--text-muted)",
                  }}
                >
                  <LaptopIcon size={16} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-[var(--text-primary)]">
                    {p.alias || p.host}
                  </p>
                  <div className="flex items-center gap-1.5 text-[11px]">
                    <span
                      className="h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{
                        backgroundColor: !p.enabled
                          ? "var(--text-muted)"
                          : p.connected
                            ? "var(--accent-green)"
                            : p.lastError
                              ? "var(--accent-red)"
                              : "var(--accent-amber)",
                      }}
                    />
                    <span className="truncate text-[var(--text-muted)]">
                      {!p.enabled
                        ? "Off"
                        : p.connected
                          ? "Connected"
                          : p.lastError
                            ? p.lastError
                            : "Connecting…"}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => setRemovePeer(p)}
                  className="shrink-0 rounded-md px-2.5 py-1 text-xs text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--accent-red)]"
                >
                  Remove
                </button>
                <Toggle
                  enabled={p.enabled}
                  ariaLabel={`Connect to ${p.alias || p.host}`}
                  onChange={(v) => void PeerSetEnabled(p.slug, v).then(refresh)}
                />
              </Row>
            );
          })
        )}
      </Group>

      {error && <p className="mt-2 px-1 text-[11px] text-[var(--accent-red)]">{error}</p>}

      <ConfirmDialog
        open={removePeer !== null}
        title="Disconnect Mac"
        variant="destructive"
        confirmLabel="Remove"
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

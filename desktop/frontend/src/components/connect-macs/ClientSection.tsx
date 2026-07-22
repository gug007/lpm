import { useCallback, useState } from "react";
import { ChevronRight } from "lucide-react";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { PeerAdd, PeerRemove, PeerSetEnabled } from "../../../bridge/commands";
import type { PeerClient } from "../../peer/usePeerState";
import { decodeInvite } from "../../peer/invite";
import { Toggle } from "./Toggle";
import { PasteInviteField } from "./PasteInviteField";
import { Group, GroupHeader, Row } from "./GroupedList";
import { LaptopIcon } from "./LaptopIcon";

const FIELD_CLASS =
  "rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-1.5 text-[13px] text-[var(--text-primary)] outline-none focus:border-[var(--accent-cyan)]";

export function ClientSection({
  peers,
  refresh,
}: {
  peers: PeerClient[];
  refresh: () => Promise<void>;
}) {
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [removePeer, setRemovePeer] = useState<PeerClient | null>(null);
  const [address, setAddress] = useState("");
  const [port, setPort] = useState("8766");
  const [code, setCode] = useState("");

  const add = useCallback(
    async (hosts: string[], p: number, c: string) => {
      setAdding(true);
      setError(null);
      try {
        // Empty alias → the host auto-names the peer after the remote Mac.
        await PeerAdd(hosts, p, c, "");
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
      void add(invite.hosts, invite.port, invite.code);
    },
    [add],
  );

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

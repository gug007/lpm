import { useCallback, useState } from "react";
import { ChevronRight } from "lucide-react";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { PeerAdd, PeerRemove, PeerSetEnabled } from "../../../bridge/commands";
import type { PeerClient } from "../../peer/usePeerState";
import { decodeInvite } from "../../peer/invite";
import { Toggle } from "./Toggle";
import { PasteInviteField } from "./PasteInviteField";
import { Group, GroupHeader, GroupFooter, Row } from "./GroupedList";

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
    <section className="mt-6">
      <GroupHeader>Connect to another Mac</GroupHeader>
      <Group>
        <div className="px-4 py-2.5">
          <PasteInviteField busy={adding} onConnect={connectFromInvite} />
        </div>

        <button
          type="button"
          onClick={() => setManualOpen((v) => !v)}
          aria-expanded={manualOpen}
          className="flex min-h-[44px] w-full items-center px-4 text-left text-[13px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)]"
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
          <Row>
            <p className="text-[13px] text-[var(--text-muted)]">Not connected to any Mac yet.</p>
          </Row>
        ) : (
          peers.map((p) => (
            <Row key={p.slug} className="group">
              <span
                className="h-2 w-2 shrink-0 rounded-full"
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
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] text-[var(--text-primary)]">
                  {p.alias || p.host}
                </p>
                <p className="truncate text-[11px] text-[var(--text-muted)]">
                  {!p.enabled
                    ? "Off"
                    : p.connected
                      ? "Connected"
                      : p.lastError
                        ? p.lastError
                        : "Connecting…"}
                </p>
              </div>
              <button
                onClick={() => setRemovePeer(p)}
                className="shrink-0 text-[12px] text-[var(--text-muted)] opacity-0 transition-colors hover:text-[var(--accent-red)] group-hover:opacity-100"
              >
                Remove
              </button>
              <Toggle
                enabled={p.enabled}
                ariaLabel={`Connect to ${p.alias || p.host}`}
                onChange={(v) => void PeerSetEnabled(p.slug, v).then(refresh)}
              />
            </Row>
          ))
        )}
      </Group>
      <GroupFooter>
        Paste an invite from another Mac to connect. Its projects show up in your sidebar and open
        just like local ones.
      </GroupFooter>

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

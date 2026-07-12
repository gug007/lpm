import { useCallback, useState } from "react";
import { ChevronRight } from "lucide-react";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { PeerAdd, PeerRemove, PeerSetEnabled } from "../../../bridge/commands";
import type { PeerClient } from "../../peer/usePeerState";
import { decodeInvite } from "../../peer/invite";
import { Toggle } from "./Toggle";
import { PasteInviteField } from "./PasteInviteField";

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

  const add = useCallback(
    async (hosts: string[], port: number, code: string) => {
      setAdding(true);
      setError(null);
      try {
        // Empty alias → the host auto-names the peer after the remote Mac.
        await PeerAdd(hosts, port, code, "");
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

  return (
    <section className="mt-10">
      <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">
        Connect to another Mac
      </h2>

      <PasteInviteField busy={adding} onConnect={connectFromInvite} />

      <button
        type="button"
        onClick={() => setManualOpen((v) => !v)}
        aria-expanded={manualOpen}
        className="mt-1 flex items-center gap-0.5 text-[11px] text-[var(--text-muted)] transition-colors hover:text-[var(--text-secondary)]"
      >
        Enter details manually
        <ChevronRight size={12} className={`transition-transform ${manualOpen ? "rotate-90" : ""}`} />
      </button>

      {manualOpen && <ManualForm busy={adding} onSubmit={add} />}

      {error && (
        <p className="mt-2 rounded-md bg-[color-mix(in_srgb,var(--accent-red)_12%,transparent)] px-2 py-1 text-xs text-[var(--accent-red)]">
          {error}
        </p>
      )}

      <div className="mt-5 flex flex-col">
        {peers.length === 0 ? (
          <p className="py-2 text-[12px] text-[var(--text-muted)]">Not connected to any Mac yet.</p>
        ) : (
          peers.map((p) => (
            <div
              key={p.slug}
              className="group flex items-center gap-3 rounded-lg px-1 py-2.5 transition-colors hover:bg-[var(--bg-hover)]"
            >
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
                <p className="truncate text-sm text-[var(--text-primary)]">{p.alias || p.host}</p>
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
              <Toggle
                enabled={p.enabled}
                ariaLabel={`Connect to ${p.alias || p.host}`}
                onChange={(v) => void PeerSetEnabled(p.slug, v).then(refresh)}
              />
              <button
                onClick={() => setRemovePeer(p)}
                className="shrink-0 rounded-md px-2 py-1 text-xs text-[var(--text-muted)] opacity-0 transition-colors hover:text-[var(--accent-red)] group-hover:opacity-100"
              >
                Remove
              </button>
            </div>
          ))
        )}
      </div>

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

function ManualForm({
  busy,
  onSubmit,
}: {
  busy: boolean;
  onSubmit: (hosts: string[], port: number, code: string) => Promise<boolean>;
}) {
  const [address, setAddress] = useState("");
  const [port, setPort] = useState("8766");
  const [code, setCode] = useState("");

  const canSubmit = address.trim().length > 0 && code.trim().length > 0 && !busy;

  const submit = async () => {
    if (!canSubmit) return;
    const ok = await onSubmit([address.trim()], Number(port) || 8766, code.trim());
    if (ok) {
      setAddress("");
      setCode("");
      setPort("8766");
    }
  };

  const field =
    "rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-cyan)]";

  return (
    <div className="mt-2 flex flex-col gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-3">
      <div className="flex gap-2">
        <input
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="Address"
          className={`${field} min-w-0 flex-1`}
        />
        <input
          value={port}
          onChange={(e) => setPort(e.target.value)}
          placeholder="Port"
          inputMode="numeric"
          className={`${field} w-20 shrink-0 tabular-nums`}
        />
      </div>
      <div className="flex gap-2">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && canSubmit) {
              e.preventDefault();
              void submit();
            }
          }}
          placeholder="Pairing code"
          className={`${field} min-w-0 flex-1 font-mono tracking-widest`}
        />
        <button
          onClick={submit}
          disabled={!canSubmit}
          className="shrink-0 rounded-lg bg-[var(--text-primary)] px-3.5 py-2 text-sm font-medium text-[var(--bg-primary)] transition-opacity hover:opacity-85 disabled:opacity-40"
        >
          Connect
        </button>
      </div>
    </div>
  );
}

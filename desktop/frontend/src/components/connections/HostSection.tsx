import { useCallback, useEffect, useState } from "react";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { PlusIcon } from "../icons";
import {
  PeerHostSetConfig,
  PeerHostStartPairing,
  PeerHostCancelPairing,
  PeerHostRevokeDevice,
} from "../../../bridge/commands";
import type { PeerHostState } from "../../peer/usePeerState";
import { encodeInvite } from "../../peer/invite";
import { Toggle } from "./Toggle";
import { InviteChip } from "./InviteChip";
import { LaptopIcon } from "./LaptopIcon";

export function HostSection({
  host,
  refresh,
}: {
  host: PeerHostState;
  refresh: () => Promise<void>;
}) {
  const [portDraft, setPortDraft] = useState(host.port);
  const [pairingBusy, setPairingBusy] = useState(false);
  const [revokeDevice, setRevokeDevice] = useState<{ id: string; name: string } | null>(null);

  // Re-seed the editable port once the async peer_state resolves.
  useEffect(() => setPortDraft(host.port), [host.port]);

  const applyHost = useCallback(
    async (next: { enabled?: boolean; port?: number }) => {
      const merged = { enabled: host.enabled, port: host.port, ...next };
      try {
        await PeerHostSetConfig(merged.enabled, merged.port, true);
      } finally {
        await refresh();
      }
    },
    [host.enabled, host.port, refresh],
  );

  const startPairing = useCallback(async () => {
    setPairingBusy(true);
    try {
      await PeerHostStartPairing();
      await refresh();
    } finally {
      setPairingBusy(false);
    }
  }, [refresh]);

  // Closing the pane never cancels a live code; only this does.
  const cancelPairing = useCallback(async () => {
    try {
      await PeerHostCancelPairing();
    } finally {
      await refresh();
    }
  }, [refresh]);

  const revoke = useCallback(
    async (id: string) => {
      try {
        await PeerHostRevokeDevice(id);
      } finally {
        await refresh();
      }
    },
    [refresh],
  );

  const pairing = host.pairing;
  const invite = pairing
    ? encodeInvite({ hosts: pairing.hosts, port: pairing.port, code: pairing.code, fp: pairing.fp })
    : "";

  return (
    <section>
      <div className="flex items-center gap-4 rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] px-4 py-4">
        <div
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-colors"
          style={{
            backgroundColor: host.enabled
              ? "color-mix(in srgb, var(--accent-green) 15%, transparent)"
              : "var(--bg-active)",
            color: host.enabled ? "var(--accent-green)" : "var(--text-muted)",
          }}
        >
          <LaptopIcon size={20} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-[var(--text-primary)]">
            Allow control of this Mac
          </p>
          <div className="mt-0.5 flex items-center gap-1.5 text-[12px]">
            <span
              className="h-1.5 w-1.5 shrink-0 rounded-full"
              style={{
                backgroundColor: !host.enabled
                  ? "var(--text-muted)"
                  : host.running
                    ? "var(--accent-green)"
                    : "var(--accent-amber)",
              }}
            />
            {!host.enabled ? (
              <span className="text-[var(--text-muted)]">
                Off — turn on to let another Mac connect
              </span>
            ) : host.running ? (
              <span className="text-[var(--text-secondary)]">
                On <span className="font-mono text-[var(--text-muted)]">· port {host.port}</span>
              </span>
            ) : (
              <span className="text-[var(--text-muted)]">
                Waiting for port {host.port} — another copy of lpm may be using it
              </span>
            )}
          </div>
        </div>
        <Toggle
          enabled={host.enabled}
          ariaLabel="Allow control of this Mac"
          onChange={(v) => void applyHost({ enabled: v })}
        />
      </div>

      {host.enabled && (
        <div className="mt-3 divide-y divide-[var(--border)] rounded-xl border border-[var(--border)]">
          <div className="flex items-center justify-between gap-4 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-[var(--text-primary)]">Port</p>
              <p className="text-[11px] leading-relaxed text-[var(--text-muted)]">
                The port other Macs connect to.
              </p>
            </div>
            <input
              type="number"
              value={portDraft}
              min={1024}
              max={65535}
              onChange={(e) => setPortDraft(Number(e.target.value) || 0)}
              onBlur={() => {
                if (portDraft !== host.port) void applyHost({ port: portDraft });
              }}
              className="w-20 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-2 py-1 text-sm tabular-nums text-[var(--text-primary)] outline-none focus:border-[var(--accent-cyan)]"
            />
          </div>
        </div>
      )}

      <div className="mt-8">
        <h2 className="mb-2 text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">
          Paired Macs
        </h2>

        {pairing && (
          <div
            className="mb-4 rounded-xl border p-4"
            style={{
              borderColor: "color-mix(in srgb, var(--accent-green) 35%, var(--border))",
              backgroundColor: "color-mix(in srgb, var(--accent-green) 5%, transparent)",
            }}
          >
            <p className="mb-2 text-sm font-medium text-[var(--text-primary)]">
              Waiting for another Mac to join
            </p>
            <p className="mb-3 text-[11px] leading-relaxed text-[var(--text-muted)]">
              Copy this invite and paste it on the other Mac. It works once and stays active until
              used.
            </p>
            <InviteChip invite={invite} />
            <div className="mt-3 flex items-center justify-between gap-3">
              <p className="min-w-0 truncate text-[11px] text-[var(--text-muted)]">
                Or enter manually:{" "}
                <span className="font-mono tracking-widest text-[var(--text-secondary)]">
                  {pairing.code}
                </span>{" "}
                · {pairing.hosts[0]}:{pairing.port}
              </p>
              <button
                onClick={cancelPairing}
                className="shrink-0 rounded-md px-2.5 py-1 text-xs text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--accent-red)]"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        <div className="overflow-hidden rounded-xl border border-[var(--border)]">
          <div className="divide-y divide-[var(--border)]">
            {host.devices.length === 0 && !pairing && (
              <p className="px-4 py-5 text-center text-[12px] text-[var(--text-muted)]">
                No Macs paired yet.
              </p>
            )}
            {host.devices.map((d) => (
              <div key={d.id} className="flex items-center gap-3 px-4 py-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--bg-active)] text-[var(--text-muted)]">
                  <LaptopIcon size={16} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-[var(--text-primary)]">
                    {d.name || "Mac"}
                  </p>
                  <p className="text-[11px] text-[var(--text-muted)]">Can control this Mac</p>
                </div>
                <button
                  onClick={() => setRevokeDevice({ id: d.id, name: d.name || "Mac" })}
                  className="shrink-0 rounded-md px-2.5 py-1 text-xs text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--accent-red)]"
                >
                  Remove
                </button>
              </div>
            ))}
            {!pairing && (
              <button
                onClick={startPairing}
                disabled={pairingBusy}
                className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--bg-hover)] disabled:opacity-60"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-dashed border-[var(--border)] text-[var(--text-muted)]">
                  <PlusIcon />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-[var(--text-primary)]">
                    {pairingBusy ? "Preparing…" : "Pair another Mac"}
                  </p>
                  <p className="text-[11px] text-[var(--text-muted)]">
                    Create a one-time invite to paste on the other Mac.
                  </p>
                </div>
              </button>
            )}
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={revokeDevice !== null}
        title="Remove paired Mac"
        variant="destructive"
        confirmLabel="Remove"
        body={
          <>
            Stop letting{" "}
            <span className="font-medium text-[var(--text-primary)]">{revokeDevice?.name}</span> control
            this Mac? It will need a new invite to reconnect.
          </>
        }
        onCancel={() => setRevokeDevice(null)}
        onConfirm={() => {
          if (revokeDevice) void revoke(revokeDevice.id);
          setRevokeDevice(null);
        }}
      />
    </section>
  );
}

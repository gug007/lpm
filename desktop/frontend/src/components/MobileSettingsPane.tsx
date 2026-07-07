import { useCallback, useEffect, useState } from "react";
import { Modal } from "./ui/Modal";
import { BTN_SECONDARY } from "./ui/buttons";
import {
  RemoteState,
  RemoteSetConfig,
  RemoteStartPairing,
  RemoteRevokeDevice,
} from "../../bridge/commands";

interface Device {
  id: string;
  name: string;
  createdAt: number;
}

interface RemoteStateShape {
  enabled: boolean;
  lan: boolean;
  port: number;
  running: boolean;
  host: string | null;
  hasPendingCode: boolean;
  devices: Device[];
}

interface Pairing {
  code: string;
  url: string;
  svg: string | null;
  host: string;
  port: number;
}

const DEFAULT_STATE: RemoteStateShape = {
  enabled: false,
  lan: false,
  port: 8765,
  running: false,
  host: null,
  hasPendingCode: false,
  devices: [],
};

function Toggle({ enabled, onChange }: { enabled: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!enabled)}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
        enabled ? "bg-[var(--accent-green)]" : "bg-[var(--border)]"
      }`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${
          enabled ? "translate-x-4" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

function Row({
  label,
  description,
  children,
}: {
  label: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-[var(--text-primary)]">{label}</p>
        <p className="text-[11px] text-[var(--text-muted)]">{description}</p>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-6 space-y-1">
      <h2 className="text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">{title}</h2>
      {description && (
        <p className="pb-2 text-[11px] leading-relaxed text-[var(--text-muted)]">{description}</p>
      )}
      <div className="divide-y divide-[var(--border)] rounded-lg border border-[var(--border)]">
        {children}
      </div>
    </div>
  );
}

export function MobileSettingsPane() {
  const [state, setState] = useState<RemoteStateShape>(DEFAULT_STATE);
  const [pairing, setPairing] = useState<Pairing | null>(null);
  const [pairingBusy, setPairingBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const s = (await RemoteState()) as RemoteStateShape;
      setState({ ...DEFAULT_STATE, ...s });
    } catch {
      /* server may be starting; leave defaults */
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const apply = useCallback(
    async (next: Partial<Pick<RemoteStateShape, "enabled" | "lan" | "port">>) => {
      const merged = { ...state, ...next };
      setState(merged);
      try {
        const s = (await RemoteSetConfig(merged.enabled, merged.lan, merged.port)) as RemoteStateShape;
        setState({ ...DEFAULT_STATE, ...s });
      } catch {
        void refresh();
      }
    },
    [state, refresh],
  );

  const startPairing = useCallback(async () => {
    setPairingBusy(true);
    try {
      const p = (await RemoteStartPairing()) as Pairing;
      setPairing(p);
      await refresh();
    } finally {
      setPairingBusy(false);
    }
  }, [refresh]);

  const revoke = useCallback(
    async (id: string) => {
      try {
        const s = (await RemoteRevokeDevice(id)) as RemoteStateShape;
        setState({ ...DEFAULT_STATE, ...s });
      } catch {
        void refresh();
      }
    },
    [refresh],
  );

  const reachable = state.host ? `${state.host}:${state.port}` : `port ${state.port}`;

  return (
    <>
      <div className="mt-6 flex items-start gap-3 rounded-lg border border-[var(--border)] px-4 py-3">
        <span
          className="mt-px shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--accent-green)]"
          style={{ backgroundColor: "color-mix(in srgb, var(--accent-green) 14%, transparent)" }}
        >
          Private beta
        </span>
        <p className="text-[12px] leading-relaxed text-[var(--text-muted)]">
          The lpm mobile app is currently in a private beta with a small group of testers. A
          wider release is coming soon.
        </p>
      </div>

      <Section
        title="Mobile devices"
        description="Control this Mac's terminals and projects from the lpm mobile app. Your phone becomes a live mirror of your terminals — every command still runs here, on your Mac."
      >
        <Row
          label="Enable remote control"
          description={
            state.enabled
              ? state.running
                ? `Listening on ${reachable}`
                : "Enabled — starting…"
              : "Off. Turn on to let a paired phone connect."
          }
        >
          <Toggle enabled={state.enabled} onChange={(v) => apply({ enabled: v })} />
        </Row>

        <Row
          label="Allow connections over the network"
          description="Off keeps the server on this Mac only (loopback). On exposes it to your local network — pair over a Tailscale tailnet for encrypted access away from home."
        >
          <Toggle enabled={state.lan} onChange={(v) => apply({ lan: v })} />
        </Row>

        <Row label="Port" description="The port the mobile app connects to.">
          <input
            type="number"
            value={state.port}
            min={1024}
            max={65535}
            onChange={(e) => setState((s) => ({ ...s, port: Number(e.target.value) || 0 }))}
            onBlur={() => apply({ port: state.port })}
            className="w-24 rounded-md border border-[var(--border)] bg-[var(--bg-primary)] px-2 py-1 text-sm text-[var(--text-primary)]"
          />
        </Row>
      </Section>

      <Section title="Paired devices" description="Phones authorized to connect. Revoke to disconnect and block a device.">
        {state.devices.length === 0 ? (
          <div className="px-4 py-4 text-[12px] text-[var(--text-muted)]">
            No devices paired yet.
          </div>
        ) : (
          state.devices.map((d) => (
            <Row
              key={d.id}
              label={d.name || "Device"}
              description={`Paired ${new Date(d.createdAt).toLocaleDateString()}`}
            >
              <button
                onClick={() => revoke(d.id)}
                className="rounded-md border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
              >
                Revoke
              </button>
            </Row>
          ))
        )}
        <div className="flex items-center justify-between gap-4 px-4 py-3">
          <p className="text-[11px] text-[var(--text-muted)]">
            Add a device by scanning a one-time QR code from the mobile app.
          </p>
          <button onClick={startPairing} disabled={pairingBusy} className={BTN_SECONDARY}>
            {pairingBusy ? "Preparing…" : "Add device…"}
          </button>
        </div>
      </Section>

      <PairingModal pairing={pairing} onClose={() => setPairing(null)} />
    </>
  );
}

function PairingModal({ pairing, onClose }: { pairing: Pairing | null; onClose: () => void }) {
  return (
    <Modal
      open={pairing !== null}
      onClose={onClose}
      zIndexClassName="z-[60]"
      contentClassName="w-[420px] rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] p-6 shadow-xl"
    >
      {pairing && (
        <>
          <h3 className="text-base font-semibold text-[var(--text-primary)]">Pair a device</h3>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            In the lpm mobile app, tap Add device and scan this code. It works once and expires
            after a device pairs.
          </p>
          <div className="mt-4 flex flex-col items-center gap-3">
            {pairing.svg ? (
              <div
                className="rounded-lg bg-white p-3"
                // The Rust side builds the QR as a self-contained SVG string.
                dangerouslySetInnerHTML={{ __html: pairing.svg }}
              />
            ) : (
              <div className="text-[11px] text-[var(--text-muted)]">QR unavailable — enter the code manually.</div>
            )}
            <div className="text-center">
              <p className="font-mono text-lg tracking-widest text-[var(--text-primary)]">{pairing.code}</p>
              <p className="mt-1 text-[11px] text-[var(--text-muted)]">
                {pairing.host}:{pairing.port}
              </p>
            </div>
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <button
              onClick={onClose}
              className="rounded-md bg-[var(--text-primary)] px-3 py-1.5 text-xs font-medium text-[var(--bg-primary)] transition-opacity hover:opacity-85"
            >
              Done
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}

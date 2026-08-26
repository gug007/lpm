import { useCallback, useEffect, useRef, useState } from "react";
import { PlusIcon, ServerIcon, SmartphoneIcon } from "./icons";
import { PairingModal, type Pairing } from "./PairingModal";
import { RemoteNotice } from "./RemoteNotice";
import { usePeerState } from "../peer/usePeerState";
import {
  RemoteState,
  RemoteSetConfig,
  RemoteStartPairing,
  RemoteRevokeDevice,
  PeerRemotePair,
} from "../../bridge/commands";
import { EventsOn, BrowserOpenURL } from "../../bridge/runtime";
import {
  REMOTE_TONE_STYLE,
  commandFailure,
  mergeCommandState,
  mergeRefreshedState,
  remoteStatus,
  type RemoteAction,
  type RemoteFailure,
} from "../remoteStatus";

const APP_STORE_URL = "https://apps.apple.com/app/lpm-link/id6788396977";

interface Device {
  id: string;
  name: string;
  createdAt: number;
}

interface RemoteStateShape {
  enabled: boolean;
  port: number;
  tailscale: boolean;
  running: boolean;
  host: string | null;
  tailscaleHost: string | null;
  identityRotated: boolean;
  hasPendingCode: boolean;
  bindError: string | null;
  configError: string | null;
  devices: Device[];
}

const DEFAULT_STATE: RemoteStateShape = {
  enabled: false,
  port: 8765,
  tailscale: true,
  running: false,
  host: null,
  tailscaleHost: null,
  identityRotated: false,
  hasPendingCode: false,
  bindError: null,
  configError: null,
  devices: [],
};

function AppleIcon({ size = 18 }: { size?: number } = {}) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M16.4 12.8c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.1-2.8.9-3.5.9-.7 0-1.8-.9-3-.8-1.5 0-2.9.9-3.7 2.2-1.6 2.7-.4 6.8 1.1 9 .8 1.1 1.7 2.3 2.9 2.3 1.2 0 1.6-.7 3-.7s1.8.7 3 .7c1.2 0 2-1.1 2.8-2.2.9-1.3 1.2-2.5 1.3-2.6-.1 0-2.5-1-2.5-3.5zM14.2 5.9c.6-.8 1.1-1.9 1-3-.9 0-2.1.6-2.8 1.4-.6.7-1.1 1.8-1 2.9 1 .1 2.1-.5 2.8-1.3z" />
    </svg>
  );
}

function Toggle({ enabled, onChange }: { enabled: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={enabled}
      onClick={() => onChange(!enabled)}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
        enabled ? "bg-[var(--accent-green)]" : "bg-[var(--bg-active)]"
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
        <p className="text-[11px] leading-relaxed text-[var(--text-muted)]">{description}</p>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-2 text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">
      {children}
    </h2>
  );
}

export function MobileSettingsPane() {
  const [state, setState] = useState<RemoteStateShape>(DEFAULT_STATE);
  const [pairing, setPairing] = useState<Pairing | null>(null);
  const [pairingBusy, setPairingBusy] = useState(false);
  const [failure, setFailure] = useState<RemoteFailure | null>(null);
  // Pairing minted by a connected peer machine: the phone scans this Mac's
  // screen but connects straight to that machine.
  const { state: peerState } = usePeerState();
  const [hostPairing, setHostPairing] = useState<{ machine: string; pairing: Pairing } | null>(
    null,
  );
  const [hostPairingBusy, setHostPairingBusy] = useState<string | null>(null);
  const [hostFailure, setHostFailure] = useState<string | null>(null);
  const reports = useRef(0);

  const refresh = useCallback(async (): Promise<RemoteStateShape | null> => {
    const seen = reports.current;
    try {
      const fresh = { ...DEFAULT_STATE, ...((await RemoteState()) as RemoteStateShape) };
      setState((prev) => mergeRefreshedState(prev, fresh, reports.current !== seen));
      return fresh;
    } catch {
      // The Mac may still be starting up — keep what the pane already shows.
      return null;
    }
  }, []);

  const reportFailure = useCallback(
    async (action: RemoteAction, err: unknown) => {
      const fresh = await refresh();
      setFailure(commandFailure(action, err, fresh?.configError ?? null));
    },
    [refresh],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const offDevices = EventsOn("remote-devices-changed", () => {
      void refresh();
      setPairing(null);
    });
    const offServer = EventsOn(
      "remote-server-changed",
      (payload: { running?: boolean; error?: string | null }) => {
        reports.current += 1;
        setState((s) => ({
          ...s,
          running: !!payload?.running,
          bindError: payload?.error ?? null,
        }));
      },
    );
    return () => {
      if (typeof offDevices === "function") offDevices();
      if (typeof offServer === "function") offServer();
    };
  }, [refresh]);

  const apply = useCallback(
    async (
      next: Partial<Pick<RemoteStateShape, "enabled" | "port" | "tailscale">>,
      action: RemoteAction,
    ) => {
      const merged = { ...state, ...next };
      setState((s) => ({ ...s, ...next }));
      setFailure(null);
      try {
        const s = (await RemoteSetConfig(
          merged.enabled,
          merged.port,
          merged.tailscale,
        )) as RemoteStateShape;
        setState((prev) => mergeCommandState(prev, { ...DEFAULT_STATE, ...s }));
      } catch (err) {
        await reportFailure(action, err);
      }
    },
    [state, reportFailure],
  );

  const startPairing = useCallback(async () => {
    setPairingBusy(true);
    setFailure(null);
    try {
      const p = (await RemoteStartPairing()) as Pairing;
      setPairing(p);
      await refresh();
    } catch (err) {
      await reportFailure("pair", err);
    } finally {
      setPairingBusy(false);
    }
  }, [refresh, reportFailure]);

  const startHostPairing = useCallback(async (slug: string, machine: string) => {
    setHostPairingBusy(slug);
    setHostFailure(null);
    try {
      const p = (await PeerRemotePair(slug)) as Pairing;
      setHostPairing({ machine, pairing: p });
    } catch (err) {
      setHostFailure(`Couldn't get a pairing code from ${machine} — ${String(err)}`);
    } finally {
      setHostPairingBusy(null);
    }
  }, []);

  const revoke = useCallback(
    async (id: string) => {
      setFailure(null);
      try {
        const s = (await RemoteRevokeDevice(id)) as RemoteStateShape;
        setState((prev) => mergeCommandState(prev, { ...DEFAULT_STATE, ...s }));
      } catch (err) {
        await reportFailure("revoke", err);
      }
    },
    [reportFailure],
  );

  const status = remoteStatus(state);
  const tone = REMOTE_TONE_STYLE[status.tone];
  const problemTone = REMOTE_TONE_STYLE.problem;
  const live = status.tone === "live";

  return (
    <>
      <div className="mt-2 flex items-center gap-4 rounded-xl border border-[var(--border)] px-4 py-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--bg-active)] text-[var(--text-secondary)]">
          <AppleIcon size={20} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-[var(--text-primary)]">lpm Link</p>
          <p className="mt-0.5 text-[12px] text-[var(--text-muted)]">
            The companion app for iPhone and iPad. Install it, then pair below.
          </p>
        </div>
        <button
          onClick={() => BrowserOpenURL(APP_STORE_URL)}
          className="shrink-0 rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
        >
          App Store
        </button>
      </div>

      <div className="mt-3 flex items-center gap-4 rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] px-4 py-4">
        <div
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-colors"
          style={{
            backgroundColor: live
              ? "color-mix(in srgb, var(--accent-green) 15%, transparent)"
              : "var(--bg-active)",
            color: live ? "var(--accent-green)" : "var(--text-muted)",
          }}
        >
          <SmartphoneIcon size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-[var(--text-primary)]">Remote control</p>
          <div className="mt-0.5 flex items-center gap-1.5 text-[12px]">
            <span
              className="h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ backgroundColor: tone.dot }}
            />
            <span style={{ color: tone.text }}>
              {status.label}
              {status.address && (
                <span className="ml-1 font-mono text-[var(--text-muted)]">{status.address}</span>
              )}
            </span>
          </div>
        </div>
        <Toggle enabled={state.enabled} onChange={(v) => apply({ enabled: v }, "server")} />
      </div>

      {failure?.slot === "server" && (
        <RemoteNotice tone={problemTone}>{failure.message}</RemoteNotice>
      )}

      {state.configError && (
        <RemoteNotice tone={problemTone}>{state.configError}</RemoteNotice>
      )}

      {status.problem && (
        <RemoteNotice tone={tone}>
          <span className="font-medium" style={{ color: tone.text }}>
            Remote control couldn&#39;t start.
          </span>{" "}
          {status.problem}
        </RemoteNotice>
      )}

      {state.enabled && (
        <div className="mt-3 divide-y divide-[var(--border)] rounded-xl border border-[var(--border)]">
          <Row label="Port" description="The port the mobile app connects to.">
            <input
              type="number"
              value={state.port}
              min={1024}
              max={65535}
              onChange={(e) => setState((s) => ({ ...s, port: Number(e.target.value) || 0 }))}
              onBlur={() => apply({ port: state.port }, "server")}
              className="w-20 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-2 py-1 text-sm tabular-nums text-[var(--text-primary)] outline-none focus:border-[var(--accent-cyan)]"
            />
          </Row>
        </div>
      )}

      {state.enabled && state.identityRotated && state.devices.length > 0 && (
        <RemoteNotice tone={REMOTE_TONE_STYLE.starting}>
          <span className="font-medium" style={{ color: "var(--accent-amber-text)" }}>
            This Mac&#39;s security identity was reset.
          </span>{" "}
          Devices paired before the reset can&#39;t connect until they trust it again — on each
          device, accept the new identity when prompted, or pair it again below.
        </RemoteNotice>
      )}

      <div className="mt-8">
        <SectionLabel>Paired devices</SectionLabel>
        <div className="overflow-hidden rounded-xl border border-[var(--border)]">
          <div className="divide-y divide-[var(--border)]">
            {state.devices.length === 0 ? (
              <p className="px-4 py-5 text-center text-[12px] text-[var(--text-muted)]">
                No devices paired yet.
              </p>
            ) : (
              state.devices.map((d) => (
                <div key={d.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--bg-active)] text-[var(--text-muted)]">
                    <SmartphoneIcon size={16} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-[var(--text-primary)]">
                      {d.name || "Device"}
                    </p>
                    <p className="text-[11px] text-[var(--text-muted)]">
                      Paired {new Date(d.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <button
                    onClick={() => revoke(d.id)}
                    className="shrink-0 rounded-md px-2.5 py-1 text-xs text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--accent-red)]"
                  >
                    Revoke
                  </button>
                </div>
              ))
            )}
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
                  {pairingBusy ? "Preparing…" : "Add a device"}
                </p>
                <p className="text-[11px] text-[var(--text-muted)]">
                  Scan a one-time QR code from the mobile app.
                </p>
              </div>
            </button>
          </div>
        </div>
        {failure?.slot === "devices" && (
          <RemoteNotice tone={problemTone}>{failure.message}</RemoteNotice>
        )}
      </div>

      {peerState.peers.length > 0 && (
        <div className="mt-8">
          <SectionLabel>Devices on other machines</SectionLabel>
          <div className="overflow-hidden rounded-xl border border-[var(--border)]">
            <div className="divide-y divide-[var(--border)]">
              {peerState.peers.map((p) => {
                const name = p.alias || p.host || "another machine";
                return (
                  <div key={p.slug} className="flex items-center gap-3 px-4 py-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--bg-active)] text-[var(--text-muted)]">
                      <ServerIcon />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-[var(--text-primary)]">
                        {name}
                      </p>
                      <p className="text-[11px] text-[var(--text-muted)]">
                        {p.connected
                          ? "A device paired here connects straight to this machine, so it keeps working while this Mac is off."
                          : "Not connected — reconnect it under Connections to pair a device."}
                      </p>
                    </div>
                    <button
                      onClick={() => startHostPairing(p.slug, name)}
                      disabled={!p.connected || hostPairingBusy !== null}
                      className="shrink-0 rounded-md px-2.5 py-1 text-xs text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-50 disabled:hover:bg-transparent"
                    >
                      {hostPairingBusy === p.slug ? "Preparing…" : "Add a device"}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
          {hostFailure && <RemoteNotice tone={problemTone}>{hostFailure}</RemoteNotice>}
        </div>
      )}

      <div className="mt-8">
        <SectionLabel>Using lpm away from home</SectionLabel>
        <div className="overflow-hidden rounded-xl border border-[var(--border)]">
          <p className="px-4 py-3 text-[12px] leading-relaxed text-[var(--text-muted)]">
            Keep this Mac awake with remote control on — every command still runs here. On the same
            Wi-Fi, your phone connects directly. To use lpm over cellular or another network, put
            both devices on a{" "}
            <span className="font-medium text-[var(--text-secondary)]">Tailscale</span> tailnet and
            include this Mac's Tailscale address in the pairing QR below, so scanning it works from
            anywhere on the tailnet.
          </p>
          {state.tailscaleHost ? (
            <div className="border-t border-[var(--border)]">
              <Row
                label="Add Tailscale address to QR"
                description={`Advertises ${state.tailscaleHost} in the pairing QR so the phone can reach this Mac over the tailnet.`}
              >
                <Toggle
                  enabled={state.tailscale}
                  onChange={(v) => apply({ tailscale: v }, "tailscale")}
                />
              </Row>
            </div>
          ) : (
            <p className="border-t border-[var(--border)] px-4 py-3 text-[12px] leading-relaxed text-[var(--text-muted)]">
              No Tailscale address detected on this Mac yet. Once this Mac joins a tailnet, its
              address can be added to the pairing QR here.
            </p>
          )}
        </div>
        {failure?.slot === "network" && (
          <RemoteNotice tone={problemTone}>{failure.message}</RemoteNotice>
        )}
      </div>

      <PairingModal pairing={pairing} onClose={() => setPairing(null)} />
      <PairingModal
        pairing={hostPairing?.pairing ?? null}
        machine={hostPairing?.machine}
        onClose={() => setHostPairing(null)}
      />
    </>
  );
}

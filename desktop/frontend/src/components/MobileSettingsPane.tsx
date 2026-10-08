import { useCallback, useEffect, useRef, useState } from "react";
import { PairingModal, type Pairing } from "./PairingModal";
import { RemoteNotice } from "./RemoteNotice";
import { ReachCard } from "./mobile/ReachCard";
import { PhonesSection } from "./mobile/PhonesSection";
import { usePeerState } from "../peer/usePeerState";
import { useTailnetState } from "../hooks/useTailnetState";
import {
  RemoteState,
  RemoteSetConfig,
  RemoteSetKeepAwake,
  RemoteStartPairing,
  RemoteRevokeDevice,
  RemoteRenameDevice,
  PeerRemotePair,
} from "../../bridge/commands";
import { EventsOn } from "../../bridge/runtime";
import {
  REMOTE_TONE_STYLE,
  commandFailure,
  mergeCommandState,
  mergeRefreshedState,
  remoteStatus,
  type RemoteAction,
  type RemoteFailure,
} from "../remoteStatus";
import { canReachAway, type KeepAwakeStatus } from "../mobile/reachStatus";
import { anyOverTailscale, type PhoneDevice } from "../mobile/phoneStatus";
import { MACHINE } from "../machineWords";

interface RemoteStateShape {
  enabled: boolean;
  port: number;
  tailscale: boolean;
  keepAwake: boolean;
  keepAwakeStatus: KeepAwakeStatus;
  running: boolean;
  host: string | null;
  tailscaleHost: string | null;
  identityRotated: boolean;
  identityCode: string;
  hasPendingCode: boolean;
  bindError: string | null;
  configError: string | null;
  devices: PhoneDevice[];
}

const DEFAULT_STATE: RemoteStateShape = {
  enabled: false,
  port: 8765,
  tailscale: true,
  keepAwake: false,
  keepAwakeStatus: "off",
  running: false,
  host: null,
  tailscaleHost: null,
  identityRotated: false,
  identityCode: "",
  hasPendingCode: false,
  bindError: null,
  configError: null,
  devices: [],
};

export function MobileSettingsPane() {
  const [state, setState] = useState<RemoteStateShape>(DEFAULT_STATE);
  const [pairing, setPairing] = useState<Pairing | null>(null);
  const [pairingBusy, setPairingBusy] = useState(false);
  const [failure, setFailure] = useState<RemoteFailure | null>(null);
  // Pairing minted by a connected peer machine: the phone scans this Mac's
  // screen but connects straight to that machine.
  const { state: peerState } = usePeerState();
  const tailnet = useTailnetState();
  const [hostPairing, setHostPairing] = useState<{ machine: string; pairing: Pairing } | null>(null);
  const [hostPairingBusy, setHostPairingBusy] = useState(false);
  const [hostFailure, setHostFailure] = useState<string | null>(null);
  const reports = useRef(0);
  // Devices change whenever a phone connects or leaves; only a phone that wasn't
  // listed before means the pairing code on screen has been used.
  const knownDevices = useRef<Set<string> | null>(null);
  // Bumped when a pairing code is shown, so only a later read can close it.
  const pairingShown = useRef(0);

  const refresh = useCallback(async (): Promise<RemoteStateShape | null> => {
    const seen = reports.current;
    const shown = pairingShown.current;
    try {
      const fresh = { ...DEFAULT_STATE, ...((await RemoteState()) as RemoteStateShape) };
      setState((prev) => mergeRefreshedState(prev, fresh, reports.current !== seen));
      const ids = new Set(fresh.devices.map((d) => d.id));
      const known = knownDevices.current;
      const paired = known && [...ids].some((id) => !known.has(id));
      // A code that was used, replaced or withdrawn elsewhere is no use on screen.
      if (paired || (!fresh.hasPendingCode && shown === pairingShown.current && shown > 0)) {
        setPairing(null);
      }
      knownDevices.current = ids;
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

  const run = useCallback(
    async (
      action: RemoteAction,
      optimistic: Partial<RemoteStateShape>,
      command: () => Promise<unknown>,
    ) => {
      setState((s) => ({ ...s, ...optimistic }));
      setFailure(null);
      try {
        const s = (await command()) as RemoteStateShape;
        setState((prev) => mergeCommandState(prev, { ...DEFAULT_STATE, ...s }));
      } catch (err) {
        await reportFailure(action, err);
      }
    },
    [reportFailure],
  );

  const apply = useCallback(
    (next: Partial<Pick<RemoteStateShape, "enabled" | "port" | "tailscale">>, action: RemoteAction) => {
      const merged = { ...state, ...next };
      return run(action, next, () => RemoteSetConfig(merged.enabled, merged.port, merged.tailscale));
    },
    [state, run],
  );

  const startPairing = useCallback(async () => {
    setPairingBusy(true);
    setFailure(null);
    try {
      const p = (await RemoteStartPairing()) as Pairing;
      pairingShown.current += 1;
      setPairing(p);
      await refresh();
    } catch (err) {
      await reportFailure("pair", err);
    } finally {
      setPairingBusy(false);
    }
  }, [refresh, reportFailure]);

  const startHostPairing = useCallback(async (slug: string, machine: string) => {
    setHostPairingBusy(true);
    setHostFailure(null);
    try {
      const p = (await PeerRemotePair(slug)) as Pairing;
      setHostPairing({ machine, pairing: p });
    } catch (err) {
      setHostFailure(`Couldn't get a pairing code from ${machine} — ${String(err)}`);
    } finally {
      setHostPairingBusy(false);
    }
  }, []);

  // Tailscale is the way to reach this machine from anywhere: offer the app's
  // address when it runs here, else turn on the built-in one and sign in.
  const setUpAway = () => {
    if (state.tailscaleHost && !state.tailscale) void apply({ tailscale: true }, "tailscale");
    else void tailnet.signIn();
  };

  const status = remoteStatus(state);
  const problemTone = REMOTE_TONE_STYLE.problem;
  const deviceUsedTailscale = anyOverTailscale(state.devices);
  const awayReady = canReachAway({
    ...state,
    builtInRunning: tailnet.state.enabled && tailnet.state.state === "running",
    deviceUsedTailscale,
  });

  return (
    <>
      <ReachCard
        reach={state}
        tailnet={tailnet}
        deviceUsedTailscale={deviceUsedTailscale}
        onEnabled={(v) => void apply({ enabled: v }, "server")}
        onUseApp={(v) => void apply({ tailscale: v }, "tailscale")}
        onPort={(port) => void apply({ port }, "server")}
        onKeepAwake={(v) => void run("keepAwake", { keepAwake: v }, () => RemoteSetKeepAwake(v))}
      />

      {(failure?.slot === "server" || failure?.slot === "network") && (
        <RemoteNotice tone={problemTone}>{failure.message}</RemoteNotice>
      )}

      {state.configError && <RemoteNotice tone={problemTone}>{state.configError}</RemoteNotice>}

      {status.problem && (
        <RemoteNotice tone={REMOTE_TONE_STYLE[status.tone]}>
          <span className="font-medium" style={{ color: REMOTE_TONE_STYLE[status.tone].text }}>
            Remote control couldn&#39;t start.
          </span>{" "}
          {status.problem}
        </RemoteNotice>
      )}

      {state.enabled && state.identityRotated && state.devices.length > 0 && (
        <RemoteNotice tone={REMOTE_TONE_STYLE.starting}>
          <span className="font-medium" style={{ color: "var(--accent-amber-text)" }}>
            {MACHINE.ThisMachine}&#39;s security identity was reset.
          </span>{" "}
          Devices paired before the reset can&#39;t connect until they trust it again. On each one,
          open lpm Link, check it shows{" "}
          <span className="font-mono font-semibold text-[var(--text-primary)]">{state.identityCode}</span>, and
          tap The codes match — or pair it again below.
        </RemoteNotice>
      )}

      <div className="mt-8">
        <PhonesSection
          devices={state.devices}
          peers={peerState.peers}
          awayReady={awayReady}
          pairing={pairingBusy || hostPairingBusy}
          settingUpAway={tailnet.busy === "signIn"}
          onSetUpAway={setUpAway}
          onPairHere={() => void startPairing()}
          onPairPeer={(slug, name) => void startHostPairing(slug, name)}
          onRename={(id, name) => void run("rename", {}, () => RemoteRenameDevice(id, name))}
          onRevoke={(id) => void run("revoke", {}, () => RemoteRevokeDevice(id))}
        />
        {failure?.slot === "devices" && <RemoteNotice tone={problemTone}>{failure.message}</RemoteNotice>}
        {hostFailure && <RemoteNotice tone={problemTone}>{hostFailure}</RemoteNotice>}
      </div>

      <PairingModal
        pairing={pairing}
        onClose={() => setPairing(null)}
        onSetUpTailscale={() => {
          setPairing(null);
          setUpAway();
        }}
      />
      <PairingModal
        pairing={hostPairing?.pairing ?? null}
        machine={hostPairing?.machine}
        onClose={() => setHostPairing(null)}
      />
    </>
  );
}

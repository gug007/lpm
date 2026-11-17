import { useCallback, useEffect, useRef, useState } from "react";
import { PairingModal } from "./PairingModal";
import { RemoteNotice } from "./RemoteNotice";
import { ReachCard } from "./mobile/ReachCard";
import { PhonesSection } from "./mobile/PhonesSection";
import { usePairingFlow } from "./mobile/usePairingFlow";
import { usePeerState } from "../peer/usePeerState";
import { useTailnetState } from "../hooks/useTailnetState";
import { builtInReachable } from "../tailnetStatus";
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
import { peerCommands } from "./settings/machineCommands";
import { useMachineWords } from "./settings/useMachineWords";
import { useSettingsTarget } from "./settings/settingsTarget";

// A connected machine's phones and server don't announce changes here, so its
// state is read again this often while shown.
const POLL_MS = 3000;

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
  const words = useMachineWords();
  const { machine, commands } = useSettingsTarget();
  const { mobile } = commands;
  const local = machine.kind === "local";
  const [state, setState] = useState<RemoteStateShape>(DEFAULT_STATE);
  const pairFlow = usePairingFlow();
  const [failure, setFailure] = useState<RemoteFailure | null>(null);
  const { state: peerState } = usePeerState();
  const tailnet = useTailnetState(commands.tailnet);
  // Pairing minted by a connected peer machine: the phone scans this Mac's
  // screen but connects straight to that machine.
  const hostFlow = usePairingFlow();
  const [host, setHost] = useState<{ slug: string; machine: string } | null>(null);
  const [hostFailure, setHostFailure] = useState<string | null>(null);
  const reports = useRef(0);

  const refresh = useCallback(async (): Promise<RemoteStateShape | null> => {
    const seen = reports.current;
    try {
      const fresh = { ...DEFAULT_STATE, ...((await mobile.state()) as RemoteStateShape) };
      setState((prev) => mergeRefreshedState(prev, fresh, reports.current !== seen));
      return fresh;
    } catch {
      // The Mac may still be starting up — keep what the pane already shows.
      return null;
    }
  }, [mobile]);

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
    if (!local) {
      const timer = setInterval(() => void refresh(), POLL_MS);
      return () => clearInterval(timer);
    }
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
  }, [refresh, local]);

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
      return run(action, next, () => mobile.setConfig(merged.enabled, merged.port, merged.tailscale));
    },
    [state, run, mobile],
  );

  const { start: startFlow } = pairFlow;
  const startPairing = useCallback(async () => {
    setFailure(null);
    try {
      await startFlow(mobile);
      await refresh();
    } catch (err) {
      await reportFailure("pair", err);
    }
  }, [refresh, reportFailure, mobile, startFlow]);

  const { start: startHostFlow } = hostFlow;
  const startHostPairing = useCallback(
    async (slug: string, machine: string) => {
      setHost({ slug, machine });
      setHostFailure(null);
      try {
        await startHostFlow(peerCommands(slug).mobile);
      } catch (err) {
        setHostFailure(`Couldn't get a pairing code from ${machine} — ${String(err)}`);
      }
    },
    [startHostFlow],
  );

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
    builtInRunning: builtInReachable(tailnet.state),
    deviceUsedTailscale,
  });

  return (
    <>
      <ReachCard
        reach={state}
        tailnet={tailnet}
        deviceUsedTailscale={deviceUsedTailscale}
        setupBelow={state.devices.length === 0}
        onEnabled={(v) => void apply({ enabled: v }, "server")}
        onUseApp={(v) => void apply({ tailscale: v }, "tailscale")}
        onPort={(port) => void apply({ port }, "server")}
        onKeepAwake={(v) => void run("keepAwake", { keepAwake: v }, () => mobile.setKeepAwake(v))}
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
            {words.ThisMachine}&#39;s security identity was reset.
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
          peers={local ? peerState.peers : []}
          awayReady={awayReady}
          pairing={pairFlow.busy || hostFlow.busy}
          settingUpAway={tailnet.busy === "signIn"}
          onSetUpAway={setUpAway}
          onPairHere={() => void startPairing()}
          onPairPeer={(slug, name) => void startHostPairing(slug, name)}
          onRename={(id, name) => void run("rename", {}, () => mobile.renameDevice(id, name))}
          onRevoke={(id) => void run("revoke", {}, () => mobile.revokeDevice(id))}
        />
        {failure?.slot === "devices" && <RemoteNotice tone={problemTone}>{failure.message}</RemoteNotice>}
        {hostFailure && <RemoteNotice tone={problemTone}>{hostFailure}</RemoteNotice>}
      </div>

      <PairingModal
        pairing={pairFlow.pairing}
        machine={local ? undefined : machine.name}
        outcome={pairFlow.outcome}
        busy={pairFlow.busy}
        onClose={pairFlow.close}
        onSetUpTailscale={() => {
          pairFlow.close();
          setUpAway();
        }}
        onNewCode={() => void startPairing()}
        onRename={(id, name) => void run("rename", {}, () => pairFlow.rename(id, name))}
      />
      <PairingModal
        pairing={hostFlow.pairing}
        machine={host?.machine}
        outcome={hostFlow.outcome}
        busy={hostFlow.busy}
        onClose={hostFlow.close}
        onNewCode={host ? () => void startHostPairing(host.slug, host.machine) : undefined}
        onRename={(id, name) =>
          void hostFlow.rename(id, name).catch((err) => setHostFailure(`Couldn't rename it — ${String(err)}`))
        }
      />
    </>
  );
}

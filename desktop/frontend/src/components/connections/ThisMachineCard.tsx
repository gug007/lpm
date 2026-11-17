import { useCallback } from "react";
import { Grip, Wifi } from "lucide-react";
import { PeerHostSetConfig } from "../../../bridge/commands";
import type { PeerHostState } from "../../peer/usePeerState";
import { hostHeadline } from "../../peer/hostHeadline";
import { builtInReachable } from "../../tailnetStatus";
import { useTailnetState } from "../../hooks/useTailnetState";
import { useKeepAwake } from "../../hooks/useKeepAwake";
import { rowProps } from "../../settings-registry";
import { Toggle } from "./Toggle";
import { LaptopIcon } from "./LaptopIcon";
import { StatusLine } from "./StatusLine";
import { WayInRow } from "../mobile/WayInRow";
import { RouteChip } from "../mobile/RouteChip";
import { BuiltInTailscaleRow } from "../mobile/BuiltInTailscaleRow";
import { ReachOptions } from "../mobile/ReachOptions";
import { RemoteNotice } from "../RemoteNotice";
import { REMOTE_TONE_STYLE } from "../../remoteStatus";
import { MACHINE as M } from "../../machineWords";

/** Allow control of this machine, and every way another one reaches it, in one
 *  card laid out like the Phone pane's. */
export function ThisMachineCard({
  host,
  refresh,
  peersOverTailscale,
}: {
  host: PeerHostState;
  refresh: () => Promise<void>;
  // A machine this one connects to is reached over Tailscale right now.
  peersOverTailscale: boolean;
}) {
  const tailnet = useTailnetState();
  const keepAwake = useKeepAwake();
  const appIp = tailnet.state.systemIp;
  const headline = hostHeadline(host, builtInReachable(tailnet.state) || !!appIp, peersOverTailscale);
  const live = host.enabled && host.running;
  const route = host.running ? "ready" : host.enabled ? "starting" : "off";

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

  return (
    <>
      <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)]">
        <div className="flex items-center gap-3 px-4 py-3.5">
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors"
            style={{
              backgroundColor: live ? "color-mix(in srgb, var(--accent-green) 15%, transparent)" : "var(--bg-active)",
              color: live ? "var(--accent-green)" : "var(--text-muted)",
            }}
          >
            <LaptopIcon size={17} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-[var(--text-primary)]">Allow control of {M.thisMachine}</p>
            <StatusLine tone={headline.tone} text={headline.text} className="mt-0.5 text-[12px]" />
          </div>
          <Toggle
            enabled={host.enabled}
            ariaLabel={`Allow control of ${M.thisMachine}`}
            onChange={(v) => void applyHost({ enabled: v })}
          />
        </div>
        <div className="divide-y divide-[var(--border)] border-t border-[var(--border)]">
          <BuiltInTailscaleRow
            audience="machines"
            tailnet={tailnet}
            hasApp={!!appIp}
            live={host.running}
            deviceOnTailscale={peersOverTailscale}
          />
          {appIp && (
            <WayInRow icon={<Grip size={16} />} title="Tailscale app" subtitle={`Running on ${M.thisMachine} · ${appIp}`}>
              <RouteChip state={route} />
            </WayInRow>
          )}
          <WayInRow
            icon={<Wifi size={16} />}
            title="Same network"
            subtitle={
              host.lanHost
                ? `${host.lanHost} · only while ${M.otherMachine} is on this network`
                : host.enabled
                  ? "No network address yet"
                  : "Turns on with Allow control"
            }
          >
            <RouteChip state={host.lanHost ? route : "off"} />
          </WayInRow>
          <ReachOptions
            port={host.port}
            onPort={(port) => void applyHost({ port })}
            keepAwake={keepAwake.on}
            keepAwakeStatus={keepAwake.status}
            onKeepAwake={host.enabled ? keepAwake.set : undefined}
            settingsRow={rowProps("connections.port").id}
            keepAwakeRow={rowProps("connections.keepAwake").id}
            open={host.enabled && !host.running}
          />
        </div>
      </div>
      {keepAwake.failure && <RemoteNotice tone={REMOTE_TONE_STYLE.problem}>{keepAwake.failure}</RemoteNotice>}
    </>
  );
}

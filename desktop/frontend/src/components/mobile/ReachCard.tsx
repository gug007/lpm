import { Grip, Smartphone, Wifi } from "lucide-react";
import { Toggle } from "../connections/Toggle";
import { RowMenu } from "../connections/RowMenu";
import { WayInRow } from "./WayInRow";
import { RouteChip } from "./RouteChip";
import { BuiltInTailscaleRow } from "./BuiltInTailscaleRow";
import { ReachOptions } from "./ReachOptions";
import { SECONDARY_BUTTON } from "./styles";
import { REMOTE_TONE_STYLE } from "../../remoteStatus";
import { reachHeadline, type KeepAwakeStatus } from "../../mobile/reachStatus";
import type { Tailnet } from "../../hooks/useTailnetState";
import { MACHINE } from "../../machineWords";

export interface ReachState {
  enabled: boolean;
  running: boolean;
  port: number;
  host: string | null;
  tailscaleHost: string | null;
  tailscale: boolean;
  bindError: string | null;
  keepAwake: boolean;
  keepAwakeStatus: KeepAwakeStatus;
  identityCode: string;
}

/** Remote control, and every way a phone can reach this machine, in one card
 *  that answers the question people open this pane with. */
export function ReachCard({
  reach,
  tailnet,
  deviceUsedTailscale,
  onEnabled,
  onUseApp,
  onPort,
  onKeepAwake,
}: {
  reach: ReachState;
  tailnet: Tailnet;
  /** A paired device has come in over Tailscale before. */
  deviceUsedTailscale: boolean;
  onEnabled: (on: boolean) => void;
  onUseApp: (on: boolean) => void;
  onPort: (port: number) => void;
  onKeepAwake: (on: boolean) => void;
}) {
  const headline = reachHeadline(
    {
      ...reach,
      builtInRunning: tailnet.state.enabled && tailnet.state.state === "running",
      deviceUsedTailscale,
    },
    MACHINE.thisMachine,
  );
  const tone = REMOTE_TONE_STYLE[headline.tone];
  const live = headline.tone === "live" || (reach.enabled && reach.running);
  const route = reach.running ? "ready" : reach.enabled && !reach.bindError ? "starting" : "off";

  return (
    <div className="mt-2 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)]">
      <div className="flex items-center gap-4 px-4 py-4">
        <div
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-colors"
          style={{
            backgroundColor: live ? "color-mix(in srgb, var(--accent-green) 15%, transparent)" : "var(--bg-active)",
            color: live ? "var(--accent-green)" : "var(--text-muted)",
          }}
        >
          <Smartphone size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-[var(--text-primary)]">Remote control</p>
          <div className="mt-0.5 flex items-center gap-1.5 text-[12px]">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: tone.dot }} />
            <span style={{ color: tone.text }}>{headline.label}</span>
          </div>
        </div>
        <Toggle enabled={reach.enabled} onChange={onEnabled} ariaLabel="Remote control" />
      </div>
      <div className="divide-y divide-[var(--border)] border-t border-[var(--border)]">
        {reach.tailscaleHost && (
          <WayInRow
            icon={<Grip size={16} />}
            title="Tailscale app"
            subtitle={
              reach.tailscale
                ? `Running on ${MACHINE.thisMachine} · ${reach.tailscaleHost}`
                : `Running on ${MACHINE.thisMachine} · not offered to phones`
            }
          >
            {reach.tailscale ? (
              <>
                <RouteChip state={route} />
                <RowMenu
                  ariaLabel="Tailscale app options"
                  items={[{ label: "Stop offering it to phones", onClick: () => onUseApp(false) }]}
                />
              </>
            ) : (
              <button onClick={() => onUseApp(true)} className={SECONDARY_BUTTON}>
                Use it
              </button>
            )}
          </WayInRow>
        )}
        <BuiltInTailscaleRow
          tailnet={tailnet}
          hasApp={!!reach.tailscaleHost}
          live={reach.running}
          deviceOnTailscale={deviceUsedTailscale}
        />
        <WayInRow
          icon={<Wifi size={16} />}
          title="Same network"
          subtitle={reach.host ? `${reach.host} · only while your device is on this network` : "No network address yet"}
        >
          <RouteChip state={reach.host ? route : "off"} />
        </WayInRow>
        <ReachOptions
          port={reach.port}
          onPort={onPort}
          keepAwake={reach.keepAwake}
          keepAwakeStatus={reach.keepAwakeStatus}
          onKeepAwake={onKeepAwake}
          identityCode={reach.identityCode}
        />
      </div>
    </div>
  );
}

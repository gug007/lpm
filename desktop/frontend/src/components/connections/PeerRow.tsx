import { Server } from "lucide-react";
import { PeerSetEnabled } from "../../../bridge/commands";
import type { PeerClient } from "../../peer/usePeerState";
import { Toggle } from "./Toggle";
import { Row } from "./GroupedList";
import { LaptopIcon } from "./LaptopIcon";
import { isLinuxHost } from "../../peer/platform";

// A connected machine's row: live indicator, name, status line, remove, on/off.
// Shared by the Macs list and the Linux hosts list — the two differ only in icon,
// which follows what the machine reported at pairing.
export function PeerRow({
  peer,
  onRemove,
  refresh,
}: {
  peer: PeerClient;
  onRemove: (peer: PeerClient) => void;
  refresh: () => Promise<void>;
}) {
  const live = peer.enabled && peer.connected;
  const name = peer.alias || peer.host;
  return (
    <Row>
      <div
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors"
        style={{
          backgroundColor: live
            ? "color-mix(in srgb, var(--accent-green) 15%, transparent)"
            : "var(--bg-active)",
          color: live ? "var(--accent-green)" : "var(--text-muted)",
        }}
      >
        {isLinuxHost(peer) ? <Server size={16} /> : <LaptopIcon size={16} />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-[var(--text-primary)]">{name}</p>
        <div className="flex items-center gap-1.5 text-[11px]">
          <span
            className="h-1.5 w-1.5 shrink-0 rounded-full"
            style={{
              backgroundColor: !peer.enabled
                ? "var(--text-muted)"
                : peer.connected
                  ? "var(--accent-green)"
                  : peer.lastError
                    ? "var(--accent-red)"
                    : "var(--accent-amber)",
            }}
          />
          <span className="truncate text-[var(--text-muted)]">
            {!peer.enabled
              ? "Off"
              : peer.connected
                ? "Connected"
                : peer.lastError
                  ? peer.lastError
                  : "Connecting…"}
          </span>
        </div>
      </div>
      <button
        onClick={() => onRemove(peer)}
        className="shrink-0 rounded-md px-2.5 py-1 text-xs text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--accent-red)]"
      >
        Remove
      </button>
      <Toggle
        enabled={peer.enabled}
        ariaLabel={`Connect to ${name}`}
        onChange={(v) => void PeerSetEnabled(peer.slug, v).then(refresh)}
      />
    </Row>
  );
}

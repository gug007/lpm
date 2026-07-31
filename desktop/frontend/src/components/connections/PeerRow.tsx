import { useState } from "react";
import { Server } from "lucide-react";
import { PeerSetEnabled, PeerUpdateHost, GetVersion } from "../../../bridge/commands";
import type { PeerClient } from "../../peer/usePeerState";
import { Toggle } from "./Toggle";
import { Row } from "./GroupedList";
import { LaptopIcon } from "./LaptopIcon";
import { isLinuxHost } from "../../peer/platform";
import { isHostBehind } from "../../peer/hostVersion";

// A connected machine's row: live indicator, name, status line, remove, on/off.
// Shared by the Macs list and the Linux hosts list — the two differ only in icon,
// which follows what the machine reported at pairing.
export function PeerRow({
  peer,
  onRemove,
  refresh,
  appVersion = "",
}: {
  peer: PeerClient;
  onRemove: (peer: PeerClient) => void;
  refresh: () => Promise<void>;
  appVersion?: string;
}) {
  const live = peer.enabled && peer.connected;
  const name = peer.alias || peer.host;
  const [updating, setUpdating] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const behind = peer.sshHost && isHostBehind(peer.version ?? "", appVersion);

  const update = async () => {
    setUpdating(true);
    setUpdateError(null);
    try {
      await PeerUpdateHost(peer.slug);
      await refresh();
    } catch (err) {
      setUpdateError(String(err));
    } finally {
      setUpdating(false);
    }
  };
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
            {updateError ?? statusText(peer)}
            {behind && !updateError ? ` · lpm ${peer.version} (update available)` : ""}
          </span>
        </div>
      </div>
      {behind && (
        <button
          onClick={() => void update()}
          disabled={updating}
          title={`Host is on ${peer.version}. Updating restarts lpm there and ends any agents running on it.`}
          className="shrink-0 rounded-md px-2.5 py-1 text-xs text-[var(--accent-cyan)] transition-colors hover:bg-[var(--bg-hover)] disabled:opacity-60"
        >
          {updating ? "Updating…" : "Update"}
        </button>
      )}
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

// A peer behind an SSH forward has two ways to be unreachable, and calling both
// of them "offline" sends the user to look at the wrong machine. Only speak up
// about the tunnel while it is actually the thing that's wrong.
function statusText(peer: PeerClient): string {
  if (!peer.enabled) return "Off";
  if (peer.connected) return "Connected";
  if (peer.sshHost) {
    if (peer.tunnel === "connecting") return `Connecting over SSH to ${peer.sshHost}…`;
    if (peer.tunnel !== "up") return peer.lastError || `No SSH connection to ${peer.sshHost}`;
  }
  return peer.lastError || "Connecting…";
}

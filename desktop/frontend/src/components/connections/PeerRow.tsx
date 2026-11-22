import { Server } from "lucide-react";
import { PeerSetEnabled } from "../../../bridge/commands";
import type { PeerClient } from "../../peer/usePeerState";
import { Toggle } from "./Toggle";
import { HostDiskLine } from "./HostDiskLine";
import { Row } from "./GroupedList";
import { LaptopIcon } from "./LaptopIcon";
import { RowMenu } from "./RowMenu";
import { isLinuxHost } from "../../peer/platform";
import { usePeerRowActions } from "./usePeerRowActions";

// A Linux host's row: live indicator, name, status line, one action worth a
// button, the rest in a menu, and on/off. Computers in the one list use
// MachineRowShell instead, with the same actions behind it.
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
  const { name, live, status, quickAction, menu, dialogs } = usePeerRowActions({
    peer,
    onRemove,
    refresh,
    appVersion,
  });

  return (
    <>
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
          {status}
          <HostDiskLine slug={peer.slug} connected={peer.connected} />
        </div>
        {quickAction}
        <RowMenu ariaLabel={`Options for ${name}`} items={menu} />
        <Toggle
          enabled={peer.enabled}
          ariaLabel={`Connect to ${name}`}
          onChange={(v) => void PeerSetEnabled(peer.slug, v).then(refresh)}
        />
      </Row>
      {dialogs}
    </>
  );
}

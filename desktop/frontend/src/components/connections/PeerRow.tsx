import { useEffect, useState } from "react";
import { Server } from "lucide-react";
import { PeerReconnect, PeerSetEnabled, PeerUpdateHost } from "../../../bridge/commands";
import type { PeerClient } from "../../peer/usePeerState";
import { peerStatus } from "../../peer/peerStatus";
import { Toggle } from "./Toggle";
import { Row } from "./GroupedList";
import { LaptopIcon } from "./LaptopIcon";
import { StatusLine } from "./StatusLine";
import { RowMenu } from "./RowMenu";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { isLinuxHost } from "../../peer/platform";
import { isHostBehind } from "../../peer/hostVersion";

const PILL_CLASS =
  "shrink-0 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-60";

// A connected machine's row: live indicator, name, status line, one action worth
// a button, and on/off. Shared by the Macs list and the Linux hosts list — the
// two differ only in icon, which follows what the machine reported at pairing.
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
  const [confirming, setConfirming] = useState(false);
  const [retrying, setRetrying] = useState(false);
  // Installing is only possible on a machine we can reach ourselves, which is
  // what sshHost means. A Mac we merely dial has no such action.
  const reachable = !!peer.sshHost;
  const behind = reachable && isHostBehind(peer.version ?? "", appVersion);
  // One action either way — it always installs the current release — so the label
  // only says which of the two the user is really doing.
  const actionLabel = behind ? "Update" : "Reinstall";

  // A retry either lands (the peer goes connected) or falls back into whatever
  // it was failing with. The dial gets a few seconds to say which before the row
  // stops claiming to be working on it.
  useEffect(() => {
    if (!retrying) return;
    if (peer.connected) {
      setRetrying(false);
      return;
    }
    const timer = setTimeout(() => setRetrying(false), 4000);
    return () => clearTimeout(timer);
  }, [retrying, peer.connected]);

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

  // Dial now instead of waiting out the retry backoff, which is half a minute
  // once a machine has been away for a while.
  const reconnect = async () => {
    setRetrying(true);
    setUpdateError(null);
    await PeerReconnect(peer.slug);
    await refresh();
  };

  const status = peerStatus(peer);
  // Only offer a retry once a dial has actually failed — while it's still
  // "Connecting…" the button would just interrupt the attempt in flight.
  const canRetry = status.tone === "error";

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
          {updating ? (
            <StatusLine
              tone="pending"
              text={behind ? "Updating lpm over SSH…" : "Reinstalling lpm over SSH…"}
            />
          ) : retrying ? (
            <StatusLine tone="pending" text="Reconnecting…" />
          ) : updateError ? (
            <StatusLine tone="error" text={updateError} />
          ) : (
            <StatusLine
              tone={status.tone}
              text={status.text}
              detail={status.detail}
              note={versionNote(peer, behind)}
            />
          )}
        </div>

        {canRetry && !updating && !retrying ? (
          <button
            onClick={() => void reconnect()}
            className={`${PILL_CLASS} text-[var(--accent-cyan)] hover:bg-[var(--bg-hover)]`}
          >
            Reconnect
          </button>
        ) : behind && !updating ? (
          <button
            onClick={() => setConfirming(true)}
            className={`${PILL_CLASS} text-[var(--accent-cyan)] hover:bg-[var(--bg-hover)]`}
          >
            Update
          </button>
        ) : null}

        <RowMenu
          ariaLabel={`Options for ${name}`}
          items={[
            ...(reachable
              ? [
                  {
                    label: behind ? "Update lpm there" : "Reinstall lpm there",
                    disabled: updating,
                    onClick: () => setConfirming(true),
                  },
                ]
              : []),
            { label: "Disconnect…", destructive: true, onClick: () => onRemove(peer) },
          ]}
        />
        <Toggle
          enabled={peer.enabled}
          ariaLabel={`Connect to ${name}`}
          onChange={(v) => void PeerSetEnabled(peer.slug, v).then(refresh)}
        />
      </Row>
      <ConfirmDialog
        open={confirming}
        title={behind ? `Update ${name}` : `Reinstall lpm on ${name}`}
        variant="destructive"
        confirmLabel={actionLabel}
        body={
          <>
            This installs the current release on{" "}
            <span className="font-medium text-[var(--text-primary)]">{name}</span> and restarts lpm
            there. Anything running on that machine — including agents — will stop.
          </>
        }
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          setConfirming(false);
          void update();
        }}
      />
    </>
  );
}

// Shown whenever we know it, not only when there's something to do about it: it's
// how you tell what a server is running without opening a terminal on it. Hosts
// only — someone else's Mac keeps itself up to date and isn't yours to mind.
function versionNote(peer: PeerClient, behind: boolean): string {
  if (!isLinuxHost(peer) || !peer.version) return "";
  return behind ? ` · lpm ${peer.version} (update available)` : ` · lpm ${peer.version}`;
}

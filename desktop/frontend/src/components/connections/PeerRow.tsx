import { useCallback, useEffect, useState } from "react";
import { Server } from "lucide-react";
import {
  PeerInvoke,
  PeerReconnect,
  PeerSetEnabled,
  PeerUninstallHost,
  PeerUpdateHost,
} from "../../../bridge/commands";
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
import {
  hostSkillDone,
  hostSkillError,
  hostSkillLabel,
  hostSkillNote,
  parseHostSkillState,
  type HostSkillState,
} from "../../peer/hostSkills";

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
  const [removing, setRemoving] = useState(false);
  // Whatever the last thing we ran over SSH failed with — one line, because only
  // one of these can be in flight at a time.
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [confirmingRemoval, setConfirmingRemoval] = useState(false);
  // Deleting the host's ~/.lpm is a separate decision from removing the install,
  // and it is not one to carry over from a dialog someone already cancelled.
  const [purgeData, setPurgeData] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [installingSkills, setInstallingSkills] = useState(false);
  // An install that worked, until something else has more to say. See
  // hostSkillDone: without this the row cannot tell the user it did anything.
  const [skillsDone, setSkillsDone] = useState(false);
  const [skills, setSkills] = useState<HostSkillState>("unknown");
  // Installing is only possible on a machine we can reach ourselves, which is
  // what sshHost means. A Mac we merely dial has no such action.
  const reachable = !!peer.sshHost;
  const behind = reachable && isHostBehind(peer.version ?? "", appVersion);
  // Skills ride the peer connection rather than SSH, so this covers a host we
  // only reach through a tunnel too. A paired Mac is left out on purpose: it has
  // the same button in its own Settings, and its answer there is its own.
  const skillsActionable = live && isLinuxHost(peer) && !behind;
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

  // Asked of the host, not worked out here: it compares what is on its disk
  // against the copies inside the binary it is running, which is the only
  // comparison that means anything on a machine that may be a release behind.
  const loadSkills = useCallback(async () => {
    if (!skillsActionable) return;
    try {
      setSkills(parseHostSkillState(await PeerInvoke(peer.slug, "agent_skill_status", {})));
    } catch {
      setSkills("unknown");
    }
  }, [skillsActionable, peer.slug]);

  useEffect(() => {
    void loadSkills();
  }, [loadSkills]);

  // Long enough to read at a glance without leaving a stale claim on a row whose
  // whole job is saying what a machine is doing right now.
  useEffect(() => {
    if (!skillsDone) return;
    const timer = setTimeout(() => setSkillsDone(false), 10000);
    return () => clearTimeout(timer);
  }, [skillsDone]);

  // No confirmation and no dialog, deliberately: this writes a dozen files and
  // restarts nothing, which is the entire reason it is separate from the update
  // above. Re-reads the host's own answer afterwards rather than assuming — and
  // says so, because the write is far too fast to be visible on its own.
  const installSkills = async () => {
    setInstallingSkills(true);
    setActionError(null);
    setSkillsDone(false);
    try {
      await PeerInvoke(peer.slug, "install_agent_skill", {});
      await loadSkills();
      setSkillsDone(true);
    } catch (err) {
      setActionError(hostSkillError(String(err)));
    } finally {
      setInstallingSkills(false);
    }
  };

  const update = async () => {
    setUpdating(true);
    setActionError(null);
    setSkillsDone(false);
    try {
      await PeerUpdateHost(peer.slug);
      await refresh();
    } catch (err) {
      setActionError(String(err));
    } finally {
      setUpdating(false);
    }
  };

  // On success this row is gone — the peer entry goes with the install — so
  // there is nothing to reset afterwards, only something to say if it fails.
  const uninstall = async (purge: boolean) => {
    setRemoving(true);
    setActionError(null);
    setSkillsDone(false);
    try {
      await PeerUninstallHost(peer.slug, purge);
      await refresh();
    } catch (err) {
      setActionError(String(err));
      setRemoving(false);
    }
  };

  // Dial now instead of waiting out the retry backoff, which is half a minute
  // once a machine has been away for a while.
  const reconnect = async () => {
    setRetrying(true);
    setActionError(null);
    setSkillsDone(false);
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
          ) : removing ? (
            <StatusLine tone="pending" text="Removing lpm over SSH…" />
          ) : installingSkills ? (
            <StatusLine tone="pending" text="Installing skills…" />
          ) : retrying ? (
            <StatusLine tone="pending" text="Reconnecting…" />
          ) : actionError ? (
            <StatusLine tone="error" text={actionError} />
          ) : skillsDone ? (
            <StatusLine tone="live" text={hostSkillDone(skills)} />
          ) : (
            <StatusLine
              tone={status.tone}
              text={status.text}
              detail={status.detail}
              note={versionNote(peer, behind, skills)}
            />
          )}
        </div>

        {canRetry && !updating && !removing && !retrying ? (
          <button
            onClick={() => void reconnect()}
            className={`${PILL_CLASS} text-[var(--accent-cyan)] hover:bg-[var(--bg-hover)]`}
          >
            Reconnect
          </button>
        ) : behind && !updating && !removing ? (
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
                    disabled: updating || removing,
                    onClick: () => setConfirming(true),
                  },
                ]
              : []),
            // Below the full install and above the destructive half: the cheap
            // fix for the one part of a host that can be stale on its own. Not
            // offered while the host is a release behind — there the skills that
            // belong on it are the ones its next binary carries, and updating
            // lpm installs them on the way up.
            ...(skillsActionable
              ? [
                  {
                    label: hostSkillLabel(skills),
                    disabled: updating || removing || installingSkills,
                    onClick: () => void installSkills(),
                  },
                ]
              : []),
            { label: "Disconnect…", destructive: true, onClick: () => onRemove(peer) },
            // Only for a machine we can reach: taking lpm off someone else's Mac
            // isn't ours to do, and there is no way to do it there anyway.
            ...(reachable
              ? [
                  {
                    label: "Remove lpm from this host…",
                    destructive: true,
                    disabled: updating || removing,
                    onClick: () => {
                      setPurgeData(false);
                      setConfirmingRemoval(true);
                    },
                  },
                ]
              : []),
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
      <ConfirmDialog
        open={confirmingRemoval}
        title={`Remove lpm from ${name}`}
        variant="destructive"
        confirmLabel="Remove lpm"
        // Deleting the machine's data is the one step nothing can undo, so it is
        // the one that asks for the name to be typed. Removing the install alone
        // is as reversible as reinstalling it.
        confirmText={purgeData ? name : undefined}
        body={
          <div className="space-y-3">
            <p>
              This uninstalls lpm from{" "}
              <span className="font-medium text-[var(--text-primary)]">{name}</span> and disconnects
              it. Services and agents running there stop. Your projects and files on that machine
              are left alone.
            </p>
            <label className="flex items-start gap-2 text-[12px] text-[var(--text-muted)]">
              <input
                type="checkbox"
                checked={purgeData}
                onChange={(e) => setPurgeData(e.target.checked)}
                className="mt-0.5 accent-[var(--accent-cyan)]"
              />
              <span>
                Also delete its lpm data — project configuration, session memory, and the identity
                it pairs with. Can&rsquo;t be undone.
              </span>
            </label>
          </div>
        }
        onCancel={() => setConfirmingRemoval(false)}
        onConfirm={() => {
          setConfirmingRemoval(false);
          void uninstall(purgeData);
        }}
      />
    </>
  );
}

// Shown whenever we know it, not only when there's something to do about it: it's
// how you tell what a server is running without opening a terminal on it. Hosts
// only — someone else's Mac keeps itself up to date and isn't yours to mind.
function versionNote(peer: PeerClient, behind: boolean, skills: HostSkillState): string {
  if (!isLinuxHost(peer) || !peer.version) return "";
  // One thing to fix at a time. A host that is behind gets told that and nothing
  // else — its skills come with the update, so naming them too would be two
  // problems where there is one.
  if (behind) return ` · lpm ${peer.version} (update available)`;
  return ` · lpm ${peer.version}${hostSkillNote(skills)}`;
}

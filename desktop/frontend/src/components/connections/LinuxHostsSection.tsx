import { useEffect, useState } from "react";
import { GetVersion, PeerRemove } from "../../../bridge/commands";
import type { PeerClient } from "../../peer/usePeerState";
import { MACHINE } from "../../machineWords";
import { useAppStore } from "../../store/app";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { Group, GroupHeader } from "./GroupedList";
import { PeerRow } from "./PeerRow";
import { AddLinuxHost } from "./AddLinuxHost";
import { HostAutoUpdateRow } from "./HostAutoUpdateRow";

// Always shown in Settings, unlike the Macs list: a server has no lpm on it to
// discover and no one sitting at it to approve a request, so the only way it can
// appear there is if that is where you go to add it. The Server screen adds hosts
// through its own choices, so it leaves out the add row (`adding`).
export function LinuxHostsSection({
  hosts,
  refresh,
  adding = true,
}: {
  hosts: PeerClient[];
  refresh: () => Promise<void>;
  adding?: boolean;
}) {
  const [removePeer, setRemovePeer] = useState<PeerClient | null>(null);
  const openSSHProject = useAppStore((s) => s.openSSHProject);

  // This Mac's version, to tell whether a host has fallen behind it.
  const [appVersion, setAppVersion] = useState("");
  useEffect(() => {
    void GetVersion()
      .then((v) => setAppVersion(String(v ?? "")))
      .catch(() => {});
  }, []);

  return (
    <section className="mt-8">
      <GroupHeader>Linux hosts you connect to</GroupHeader>
      <p className="mb-3 text-[12px] leading-relaxed text-[var(--text-muted)]">
        A Linux host runs lpm itself, so one server holds as many projects as you like, and its agents keep running
        while {MACHINE.thisMachine} sleeps.
      </p>
      <Group>
        {hosts.map((p) => (
          <PeerRow
            key={p.slug}
            peer={p}
            onRemove={setRemovePeer}
            refresh={refresh}
            appVersion={appVersion}
          />
        ))}
        {adding && <AddLinuxHost refresh={refresh} />}
      </Group>
      {hosts.length > 0 && <HostAutoUpdateRow />}
      {adding && (
        <p className="mt-3 text-[12px] leading-relaxed text-[var(--text-muted)]">
          Only need one folder, with nothing installed on the server?{" "}
          <button
            type="button"
            onClick={openSSHProject}
            className="font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:underline"
          >
            Add an SSH project
          </button>{" "}
          instead.
        </p>
      )}

      <ConfirmDialog
        open={removePeer !== null}
        title="Disconnect Linux host"
        variant="destructive"
        confirmLabel="Disconnect"
        body={
          <>
            Disconnect from{" "}
            <span className="font-medium text-[var(--text-primary)]">
              {removePeer?.alias || removePeer?.host}
            </span>
            ? Its projects will no longer appear here, and {MACHINE.thisMachine} is removed there
            too. Anything running on it keeps running.
          </>
        }
        onCancel={() => setRemovePeer(null)}
        onConfirm={() => {
          if (removePeer) void PeerRemove(removePeer.slug).then(refresh);
          setRemovePeer(null);
        }}
      />
    </section>
  );
}

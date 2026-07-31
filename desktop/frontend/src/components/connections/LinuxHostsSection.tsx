import { useEffect, useState } from "react";
import { GetVersion, PeerRemove } from "../../../bridge/commands";
import type { PeerClient } from "../../peer/usePeerState";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { Group, GroupHeader } from "./GroupedList";
import { PeerRow } from "./PeerRow";
import { AddLinuxHost } from "./AddLinuxHost";

// Always shown, unlike the Macs list: a server has no lpm on it to discover and
// no one sitting at it to approve a request, so the only way it can appear here
// is if this is where you go to add it.
export function LinuxHostsSection({
  hosts,
  refresh,
}: {
  hosts: PeerClient[];
  refresh: () => Promise<void>;
}) {
  const [removePeer, setRemovePeer] = useState<PeerClient | null>(null);

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
        <AddLinuxHost refresh={refresh} />
      </Group>

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
            ? Its projects will no longer appear here. Anything running on it keeps running.
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
